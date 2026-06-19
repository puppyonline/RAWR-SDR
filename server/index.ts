import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess, execSync } from 'child_process';
import { demodAM, resetState } from './dsp';

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
    await new Promise((r) => setTimeout(r, 800));
  }
  currentRDS = {};
  resetState();
  currentMode = mode;

  const isWin = process.platform === 'win32';

  try {
    if (mode === 'fm' || mode === 'hd') {
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
      // === AM broadcast: rtl_sdr + our DSP (needs direct sampling) ===
      const rtlSdr = isWin ? 'rtl_sdr.exe' : 'rtl_sdr';
      const freqHz = Math.round(frequency * 1000);

      // rtl_sdr syntax: rtl_sdr [options] filename
      // '-' means stdout. Must be LAST argument.
      const args = ['-D', '2', '-s', '240000', '-f', String(freqHz), '-g', '30', '-S', '-'];

      console.log(`[RAWR-SDR] AM: ${rtlSdr} ${args.join(' ')}`);
      activeProcess = spawn(rtlSdr, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      activeProcess.stderr?.on('data', (d: Buffer) => {
        const m = d.toString().trim();
        if (m) console.log(`[rtl_sdr] ${m}`);
      });

      activeProcess.stdout?.on('data', (chunk: Buffer) => {
        const pcm = demodAM(chunk);
        if (pcm.length > 0) {
          wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(pcm); });
        }
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
