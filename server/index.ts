import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess, execSync } from 'child_process';

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

// Detect RTL-SDR on startup
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

// Check if redsea is available
function hasRedsea(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'where redsea' : 'which redsea';
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const redseaAvailable = hasRedsea();

try {
  sdrDetected = detectSDR();
  console.log(`[RAWR-SDR] Device: ${sdrDetected ? 'DETECTED' : 'NOT FOUND'}`);
  console.log(`[RAWR-SDR] Redsea: ${redseaAvailable ? 'AVAILABLE' : 'NOT FOUND (RDS disabled)'}`);
} catch {
  console.log('[RAWR-SDR] Detection skipped');
}

/**
 * Downsample 16-bit PCM from srcRate to dstRate using linear interpolation.
 * Handles odd-byte input by truncating to even boundary.
 */
function downsample(input: Buffer, srcRate: number, dstRate: number): Buffer {
  // Ensure we have an even number of bytes (16-bit samples)
  const usableBytes = input.length & ~1;
  if (usableBytes < 4) return Buffer.alloc(0);

  const srcSamples = usableBytes / 2;
  const ratio = srcRate / dstRate;
  const dstSamples = Math.floor(srcSamples / ratio);
  if (dstSamples < 1) return Buffer.alloc(0);

  const output = Buffer.alloc(dstSamples * 2);

  for (let i = 0; i < dstSamples; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.min(Math.floor(srcPos), srcSamples - 1);
    const frac = srcPos - srcIdx;

    const s0 = input.readInt16LE(srcIdx * 2);
    const nextIdx = Math.min(srcIdx + 1, srcSamples - 1);
    const s1 = input.readInt16LE(nextIdx * 2);
    const interpolated = Math.round(s0 + (s1 - s0) * frac);

    output.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
  }

  return output;
}

// Status endpoint
app.get('/api/status', (_req, res) => {
  res.json({
    sdrConnected: sdrDetected,
    device: sdrDetected ? 'RTL2832U R820T2' : 'No device',
    sampleRate: 2400000,
    gain: 'Auto',
    activeMode: activeProcess ? 'Streaming' : 'Idle',
    redseaAvailable,
  });
});

// RDS data endpoint
app.get('/api/rds', (_req, res) => {
  res.json(currentRDS);
});

// Tuning endpoint
app.post('/api/tune', async (req, res) => {
  const { frequency, mode, squelch } = req.body;

  // Kill existing processes
  if (redseaProcess) {
    redseaProcess.kill('SIGTERM');
    redseaProcess = null;
  }
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  currentRDS = {};

  const isWin = process.platform === 'win32';
  const rtlFm = isWin ? 'rtl_fm.exe' : 'rtl_fm';
  const args: string[] = [];
  let useFMWithRDS = false;

  switch (mode) {
    case 'fm':
    case 'hd':
      // For FM: run at 171kHz sample rate (required by redsea for RDS)
      // We downsample to 48kHz in Node before sending to WebSocket
      // AND pipe the raw 171k data to redsea for RDS decoding
      if (redseaAvailable) {
        useFMWithRDS = true;
        args.push(
          '-M', 'fm',
          '-f', `${frequency}M`,
          '-s', '171k',          // 171kHz = redsea's required rate
          '-l', '0',
          '-E', 'deemp',
          '-g', '20',
        );
      } else {
        // No redsea: use 192k with -r 48000 as before
        args.push(
          '-M', 'fm',
          '-f', `${frequency}M`,
          '-s', '192k',
          '-r', '48000',
          '-l', '0',
          '-E', 'deemp',
          '-g', '20',
        );
      }
      break;

    case 'am':
      args.push(
        '-M', 'am',
        '-f', `${frequency}k`,
        '-s', '240k',           // 240kHz hardware rate (min for RTL-SDR is ~225k)
        '-r', '48000',          // resample 240k -> 48k (clean 5:1 ratio)
        '-l', '0',
        '-g', '0',
        '-E', 'direct',
      );
      break;

    case 'atc':
      args.push(
        '-M', 'am',
        '-f', `${frequency}M`,
        '-s', '240k',           // 240kHz hardware rate
        '-r', '48000',          // resample 240k -> 48k (clean 5:1)
        '-l', String(squelch || 50),
        '-g', '0',
        '-p', '0',
      );
      break;

    default:
      res.status(400).json({ error: `Unknown mode: ${mode}` });
      return;
  }

  console.log(`[RAWR-SDR] Tuning: ${rtlFm} ${args.join(' ')}`);

  try {
    activeProcess = spawn(rtlFm, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    activeProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[rtl_fm] ${msg}`);
    });

    if (useFMWithRDS) {
      // Spawn redsea for RDS decoding
      const redseaCmd = isWin ? 'redsea.exe' : 'redsea';
      redseaProcess = spawn(redseaCmd, ['-r', '171k'], { stdio: ['pipe', 'pipe', 'pipe'] });

      // Prevent EPIPE from crashing the server
      redseaProcess.stdin?.on('error', () => {});

      redseaProcess.stdout?.on('data', (data: Buffer) => {
        // redsea outputs newline-delimited JSON
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const rds = JSON.parse(line);
            // Merge RDS fields into our state
            if (rds.ps) currentRDS.ps = rds.ps;
            if (rds.radiotext) currentRDS.radiotext = rds.radiotext;
            if (rds.prog_type) currentRDS.prog_type = rds.prog_type;
            if (rds.pi) currentRDS.pi = rds.pi;
            if (rds.tp !== undefined) currentRDS.tp = rds.tp;
            if (rds.ta !== undefined) currentRDS.ta = rds.ta;
            if (rds.is_music !== undefined) currentRDS.is_music = rds.is_music;
            if (rds.radiotext_plus) {
              const rtp = rds.radiotext_plus;
              if (rtp.tags) {
                for (const tag of rtp.tags) {
                  if (tag['content-type'] === 'item.title') currentRDS.title = tag.data;
                  if (tag['content-type'] === 'item.artist') currentRDS.artist = tag.data;
                }
              }
            }
            // Broadcast RDS update to clients
            const rdsMsg = JSON.stringify({ type: 'rds', data: currentRDS });
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(rdsMsg);
              }
            });
          } catch { /* skip malformed lines */ }
        }
      });

      redseaProcess.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[redsea] ${msg}`);
      });

      redseaProcess.on('close', () => { redseaProcess = null; });

      // Pipe rtl_fm stdout: downsample for audio AND feed to redsea
      activeProcess.stdout?.on('data', (chunk: Buffer) => {
        // Feed raw 171k data to redsea
        if (redseaProcess && redseaProcess.stdin?.writable) {
          try {
            redseaProcess.stdin.write(chunk);
          } catch { /* ignore write errors */ }
        }
        // Downsample 171kHz -> 48kHz for audio playback
        const audioChunk = downsample(chunk, 171000, 48000);
        if (audioChunk.length > 0) {
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(audioChunk);
            }
          });
        }
      });
    } else {
      // Non-FM modes or no redsea: just forward PCM directly
      activeProcess.stdout?.on('data', (chunk: Buffer) => {
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(chunk);
          }
        });
      });
    }

    activeProcess.on('error', (err) => {
      console.error(`[rtl_fm] Spawn error: ${err.message}`);
      activeProcess = null;
    });

    activeProcess.on('close', (code) => {
      console.log(`[rtl_fm] Process exited (code ${code})`);
      activeProcess = null;
      if (redseaProcess) {
        redseaProcess.kill('SIGTERM');
        redseaProcess = null;
      }
    });

    res.json({ success: true, frequency, mode, rds: useFMWithRDS });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to start: ${err.message}` });
  }
});

// Stop streaming
app.post('/api/stop', (_req, res) => {
  if (redseaProcess) {
    redseaProcess.kill('SIGTERM');
    redseaProcess = null;
  }
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
    console.log('[RAWR-SDR] Stream stopped');
  }
  currentRDS = {};
  res.json({ success: true });
});

// ADS-B
app.post('/api/adsb/start', (_req, res) => {
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
  }
  const cmd = process.platform === 'win32' ? 'dump1090.exe' : 'dump1090';
  try {
    activeProcess = spawn(cmd, ['--interactive', '--net'], { stdio: ['pipe', 'pipe', 'pipe'] });
    activeProcess.on('error', (err) => { console.error(`[dump1090] ${err.message}`); activeProcess = null; });
    activeProcess.on('close', (code) => { console.log(`[dump1090] Exited (${code})`); activeProcess = null; });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/adsb/stop', (_req, res) => {
  if (activeProcess) { activeProcess.kill('SIGTERM'); activeProcess = null; }
  res.json({ success: true });
});

// WebSocket
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  // Send current RDS data immediately on connect
  if (Object.keys(currentRDS).length > 0) {
    ws.send(JSON.stringify({ type: 'rds', data: currentRDS }));
  }
  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    if (wss.clients.size === 0 && activeProcess) {
      console.log('[WS] No clients, stopping');
      if (redseaProcess) { redseaProcess.kill('SIGTERM'); redseaProcess = null; }
      activeProcess.kill('SIGTERM');
      activeProcess = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`[RAWR-SDR] Server: http://localhost:${PORT}`);
  console.log(`[RAWR-SDR] WS: ws://localhost:${PORT}/ws`);
  if (!sdrDetected) console.log('[RAWR-SDR] No RTL-SDR detected.');
  if (!redseaAvailable) console.log('[RAWR-SDR] redsea not found. Install for RDS: https://github.com/windytan/redsea');
});
