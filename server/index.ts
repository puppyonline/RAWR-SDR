import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess, execSync } from 'child_process';
import hdhrRouter from './hdhr';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

let activeProcess: ChildProcess | null = null;
let redseaProcess: ChildProcess | null = null;
let sdrDetected = false;
let currentRDS: Record<string, any> = {};
let currentMode = '';

function detectSDR(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'rtl_test.exe' : 'rtl_test';
    execSync(`${cmd} -t`, { timeout: 5000, stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch (e: any) {
    const output = (e.stderr || e.stdout || '').toString();
    return output.includes('Found') || output.includes('RTL') || output.includes('R820');
  }
}

function hasRedsea(): boolean {
  try {
    execSync(process.platform === 'win32' ? 'where redsea' : 'which redsea', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

const redseaAvailable = hasRedsea();

try {
  sdrDetected = detectSDR();
  console.log(`[RAWR-SDR] Device: ${sdrDetected ? 'DETECTED' : 'NOT FOUND'}`);
  console.log(`[RAWR-SDR] Redsea: ${redseaAvailable ? 'AVAILABLE' : 'NOT FOUND'}`);
} catch { console.log('[RAWR-SDR] Detection skipped'); }

app.get('/api/status', (_req, res) => {
  res.json({
    sdrConnected: sdrDetected,
    device: sdrDetected ? 'RTL2832U R820T2' : 'No device',
    sampleRate: 240000,
    gain: '20 dB',
    activeMode: activeProcess ? `Streaming (${currentMode})` : 'Idle',
    redseaAvailable,
  });
});

app.get('/api/rds', (_req, res) => res.json(currentRDS));

// HDHomeRun TV endpoints
app.use('/api/hdhr', hdhrRouter);

/**
 * Hybrid tuning approach:
 *
 * FM/HD: Use rtl_fm (proven working on this Windows machine at 171k for RDS)
 *   - rtl_fm handles wideband FM demodulation internally
 *   - We downsample 171k->48k in Node for audio
 *   - Pipe to redsea for RDS if available
 *
 * AM/ATC: Use rtl_sdr + our own DSP (rtl_fm's resample is broken on Windows)
 *   - rtl_sdr captures raw IQ at 240kHz
 *   - server/dsp.ts does envelope detection + decimation + AGC
 */
app.post('/api/tune', async (req, res) => {
  const { frequency, mode } = req.body;

  if (redseaProcess) { redseaProcess.kill('SIGTERM'); redseaProcess = null; }
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
    // nrsc5 holds USB longer than rtl_fm, need more delay
    await new Promise((r) => setTimeout(r, mode === 'hd' ? 1500 : 800));
  }
  currentRDS = {};
  currentMode = mode;

  const isWin = process.platform === 'win32';

  try {
    if (mode === 'fm') {
      // === FM: use rtl_fm at 171k (works, proven in earlier testing) ===
      const rtlFm = isWin ? 'rtl_fm.exe' : 'rtl_fm';
      const args = [
        '-M', 'fm',
        '-f', `${frequency}M`,
        '-s', '171k',
        '-l', '0',
        '-E', 'deemp',
        '-g', '20',
      ];

      console.log(`[RAWR-SDR] FM: ${rtlFm} ${args.join(' ')}`);
      activeProcess = spawn(rtlFm, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      activeProcess.stderr?.on('data', (d: Buffer) => {
        const m = d.toString().trim();
        if (m) console.log(`[rtl_fm] ${m}`);
      });

      // Spawn redsea if available
      if (redseaAvailable) {
        const redseaCmd = isWin ? 'redsea.exe' : 'redsea';
        redseaProcess = spawn(redseaCmd, ['-r', '171k'], { stdio: ['pipe', 'pipe', 'pipe'] });
        redseaProcess.stdin?.on('error', () => {});
        redseaProcess.stdout?.on('data', (d: Buffer) => {
          const lines = d.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const rds = JSON.parse(line);
              if (rds.ps) currentRDS.ps = rds.ps;
              if (rds.radiotext) currentRDS.radiotext = rds.radiotext;
              if (rds.prog_type) currentRDS.prog_type = rds.prog_type;
              if (rds.pi) currentRDS.pi = rds.pi;
              if (rds.radiotext_plus?.tags) {
                for (const tag of rds.radiotext_plus.tags) {
                  if (tag['content-type'] === 'item.title') currentRDS.title = tag.data;
                  if (tag['content-type'] === 'item.artist') currentRDS.artist = tag.data;
                }
              }
              const rdsMsg = JSON.stringify({ type: 'rds', data: currentRDS });
              wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(rdsMsg); });
            } catch {}
          }
        });
        redseaProcess.stderr?.on('data', (d: Buffer) => {
          const m = d.toString().trim();
          if (m) console.log(`[redsea] ${m}`);
        });
        redseaProcess.on('close', () => { redseaProcess = null; });
      }

      // Downsample 171kHz -> 48kHz for audio
      activeProcess.stdout?.on('data', (chunk: Buffer) => {
        // Feed to redsea
        if (redseaProcess?.stdin?.writable) {
          try { redseaProcess.stdin.write(chunk); } catch {}
        }

        // Downsample: 171000/48000 ≈ 3.5625:1
        const usable = chunk.length & ~1;
        if (usable < 4) return;
        const srcSamples = usable / 2;
        const ratio = 171000 / 48000;
        const dstSamples = Math.floor(srcSamples / ratio);
        if (dstSamples < 1) return;

        const output = Buffer.alloc(dstSamples * 2);
        for (let i = 0; i < dstSamples; i++) {
          const srcPos = i * ratio;
          const srcIdx = Math.min(Math.floor(srcPos), srcSamples - 1);
          output.writeInt16LE(chunk.readInt16LE(srcIdx * 2), i * 2);
        }

        wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(output); });
      });

    } else if (mode === 'hd') {
      // === HD Radio: use nrsc5 for NRSC-5 digital decoding ===
      // nrsc5 directly controls the RTL-SDR, decodes digital audio,
      // and outputs raw 16-bit stereo PCM at 44100 Hz via -o - -t raw
      // Metadata (Title, Artist, Station) comes on stderr as log lines
      const nrsc5Cmd = isWin ? 'nrsc5.exe' : 'nrsc5';
      const hdProgram = String(req.body.hdChannel || 0); // 0=HD1, 1=HD2, etc.
      const args = ['-o', '-', '-t', 'raw', '-l', '2', `${frequency}`, hdProgram];

      console.log(`[RAWR-SDR] HD: ${nrsc5Cmd} ${args.join(' ')}`);
      activeProcess = spawn(nrsc5Cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      // Parse metadata from stderr
      let stderrBuffer = '';
      activeProcess.stderr?.on('data', (d: Buffer) => {
        stderrBuffer += d.toString();
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.replace(/^(\d{4}-\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}[\s|]*/, '').trim();
          if (trimmed.startsWith('Title:')) currentRDS.title = trimmed.slice(7).trim();
          else if (trimmed.startsWith('Artist:')) currentRDS.artist = trimmed.slice(8).trim();
          else if (trimmed.startsWith('Album:')) currentRDS.album = trimmed.slice(7).trim();
          else if (trimmed.startsWith('Genre:')) currentRDS.genre = trimmed.slice(7).trim();
          else if (trimmed.startsWith('Station name:')) currentRDS.ps = trimmed.slice(14).trim();
          else if (trimmed.startsWith('Slogan:')) currentRDS.slogan = trimmed.slice(8).trim();
          else if (trimmed.startsWith('Audio bit rate:')) currentRDS.bitrate = trimmed.slice(16).trim();
          else if (trimmed.startsWith('Audio program 0:')) {
            // Extract genre from "Audio program 0: public, type: Top 40, sound experience 0"
            const typeMatch = trimmed.match(/type:\s*([^,]+)/);
            if (typeMatch) currentRDS.genre = typeMatch[1].trim();
          }
          else if (trimmed.startsWith('Synchronized')) currentRDS.synced = true;
          else if (trimmed.startsWith('Lost sync')) currentRDS.synced = false;

          if (trimmed.startsWith('Title:') || trimmed.startsWith('Artist:') ||
              trimmed.startsWith('Station name:')) {
            const rdsMsg = JSON.stringify({ type: 'rds', data: currentRDS });
            wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(rdsMsg); });
          }
          if (trimmed) console.log(`[nrsc5] ${trimmed}`);
        }
      });

      // nrsc5 -o - -t raw outputs 16-bit signed stereo PCM at 44100 Hz
      // Convert to mono and resample to 48000 Hz to match other modes
      let residualSamples = Buffer.alloc(0);
      activeProcess.stdout?.on('data', (chunk: Buffer) => {
        // Combine with any leftover from last chunk
        const combined = Buffer.concat([residualSamples, chunk]);
        const usable = combined.length & ~3; // stereo 16-bit = 4 bytes per frame
        residualSamples = combined.subarray(usable);
        if (usable < 4) return;

        const frames = usable / 4;
        // Mix stereo to mono
        const mono44 = new Float32Array(frames);
        for (let i = 0; i < frames; i++) {
          const left = combined.readInt16LE(i * 4) / 32768;
          const right = combined.readInt16LE(i * 4 + 2) / 32768;
          mono44[i] = (left + right) * 0.5;
        }

        // Resample 44100 -> 48000 (ratio ~1.088)
        const ratio = 44100 / 48000;
        const outLen = Math.floor(frames / ratio);
        const output = Buffer.alloc(outLen * 2);
        for (let i = 0; i < outLen; i++) {
          const srcPos = i * ratio;
          const srcIdx = Math.min(Math.floor(srcPos), frames - 1);
          const sample = mono44[srcIdx];
          output.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32000), i * 2);
        }

        wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(output); });
      });

    } else if (mode === 'atc') {
      // === ATC: rtl_fm works fine for VHF AM (118-137 MHz, no direct sampling) ===
      // Same approach as FM: run at 171k, downsample in Node
      const rtlFm = isWin ? 'rtl_fm.exe' : 'rtl_fm';
      const args = [
        '-M', 'am',
        '-f', `${frequency}M`,
        '-s', '171k',
        '-l', '0',
        '-g', '30',
      ];

      console.log(`[RAWR-SDR] ATC: ${rtlFm} ${args.join(' ')}`);
      activeProcess = spawn(rtlFm, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      activeProcess.stderr?.on('data', (d: Buffer) => {
        const m = d.toString().trim();
        if (m) console.log(`[rtl_fm] ${m}`);
      });

      // Downsample 171kHz -> 48kHz
      activeProcess.stdout?.on('data', (chunk: Buffer) => {
        const usable = chunk.length & ~1;
        if (usable < 4) return;
        const srcSamples = usable / 2;
        const ratio = 171000 / 48000;
        const dstSamples = Math.floor(srcSamples / ratio);
        if (dstSamples < 1) return;

        const output = Buffer.alloc(dstSamples * 2);
        for (let i = 0; i < dstSamples; i++) {
          const srcIdx = Math.min(Math.floor(i * ratio), srcSamples - 1);
          output.writeInt16LE(chunk.readInt16LE(srcIdx * 2), i * 2);
        }

        wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(output); });
      });

    } else {
      // === AM broadcast: rtl_fm with direct sampling ===
      // rtl_fm handles direct sampling mode correctly (-E direct)
      // and tunes to the right frequency. We just downsample 171k->48k in Node.
      const rtlFm = isWin ? 'rtl_fm.exe' : 'rtl_fm';
      const args = [
        '-M', 'am',
        '-f', `${frequency}k`,
        '-s', '171k',
        '-l', '0',
        '-g', '30',
        '-E', 'direct',
      ];

      console.log(`[RAWR-SDR] AM: ${rtlFm} ${args.join(' ')}`);
      activeProcess = spawn(rtlFm, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      activeProcess.stderr?.on('data', (d: Buffer) => {
        const m = d.toString().trim();
        if (m) console.log(`[rtl_fm] ${m}`);
      });

      // Downsample 171kHz -> 48kHz (same as FM/ATC)
      activeProcess.stdout?.on('data', (chunk: Buffer) => {
        const usable = chunk.length & ~1;
        if (usable < 4) return;
        const srcSamples = usable / 2;
        const ratio = 171000 / 48000;
        const dstSamples = Math.floor(srcSamples / ratio);
        if (dstSamples < 1) return;

        const output = Buffer.alloc(dstSamples * 2);
        for (let i = 0; i < dstSamples; i++) {
          const srcIdx = Math.min(Math.floor(i * ratio), srcSamples - 1);
          output.writeInt16LE(chunk.readInt16LE(srcIdx * 2), i * 2);
        }

        wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(output); });
      });
    }

    activeProcess.on('error', (err) => {
      console.error(`[SDR] Error: ${err.message}`);
      activeProcess = null;
    });

    activeProcess.on('close', (code) => {
      console.log(`[SDR] Exited (code ${code})`);
      activeProcess = null;
    });

    res.json({ success: true, frequency, mode });
  } catch (err: any) {
    res.status(500).json({ error: `Failed: ${err.message}` });
  }
});

app.post('/api/stop', (_req, res) => {
  if (redseaProcess) { redseaProcess.kill('SIGTERM'); redseaProcess = null; }
  if (activeProcess) { activeProcess.kill('SIGTERM'); activeProcess = null; }
  currentRDS = {};
  currentMode = '';
  res.json({ success: true });
});

app.post('/api/adsb/start', (_req, res) => {
  if (activeProcess) { activeProcess.kill('SIGTERM'); activeProcess = null; }
  const cmd = process.platform === 'win32' ? 'dump1090.exe' : 'dump1090';
  try {
    activeProcess = spawn(cmd, ['--interactive', '--net'], { stdio: ['pipe', 'pipe', 'pipe'] });
    activeProcess.on('error', (e) => { console.error(`[dump1090] ${e.message}`); activeProcess = null; });
    activeProcess.on('close', (c) => { console.log(`[dump1090] Exited (${c})`); activeProcess = null; });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/adsb/stop', (_req, res) => {
  if (activeProcess) { activeProcess.kill('SIGTERM'); activeProcess = null; }
  res.json({ success: true });
});

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  if (Object.keys(currentRDS).length > 0) {
    ws.send(JSON.stringify({ type: 'rds', data: currentRDS }));
  }
  ws.on('close', () => { console.log('[WS] Client disconnected'); });
});

server.listen(PORT, () => {
  console.log(`[RAWR-SDR] Server: http://localhost:${PORT}`);
  console.log(`[RAWR-SDR] WS: ws://localhost:${PORT}/ws`);
  if (!sdrDetected) console.log('[RAWR-SDR] No RTL-SDR detected.');
});
