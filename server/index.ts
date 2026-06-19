import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess, execSync } from 'child_process';
import { demodFM, demodAM, resetState } from './dsp';

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

// Detect RTL-SDR
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
    const cmd = process.platform === 'win32' ? 'where redsea' : 'which redsea';
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

const redseaAvailable = hasRedsea();

try {
  sdrDetected = detectSDR();
  console.log(`[RAWR-SDR] Device: ${sdrDetected ? 'DETECTED' : 'NOT FOUND'}`);
  console.log(`[RAWR-SDR] Redsea: ${redseaAvailable ? 'AVAILABLE' : 'NOT FOUND'}`);
} catch {
  console.log('[RAWR-SDR] Detection skipped');
}

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

app.get('/api/rds', (_req, res) => {
  res.json(currentRDS);
});

/**
 * Tuning with rtl_sdr + server-side DSP.
 *
 * Instead of relying on rtl_fm (which has broken resampling on Windows),
 * we use rtl_sdr to capture raw unsigned 8-bit IQ samples and do all
 * demodulation/decimation/filtering in Node.js (see dsp.ts).
 *
 * This is the same approach used by OpenWebRX/KiwiSDR/csdr:
 *   rtl_sdr (raw IQ) -> demodulate -> decimate -> filter -> PCM audio
 *
 * Sample rate: 240kHz for all modes (minimum reliable for RTL-SDR hardware)
 * After 5:1 decimation: 48kHz audio output
 */
app.post('/api/tune', async (req, res) => {
  const { frequency, mode } = req.body;

  // Kill existing
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
  const rtlSdr = isWin ? 'rtl_sdr.exe' : 'rtl_sdr';

  // Build rtl_sdr command
  // rtl_sdr outputs raw unsigned 8-bit IQ pairs to stdout
  // -s 240000 = 240kHz sample rate
  // -g 20 = 20 dB gain (or 30 for AM)
  // -f freq = center frequency in Hz
  let freqHz: number;
  let gain: number;
  let directSampling = false;

  switch (mode) {
    case 'fm':
    case 'hd':
      freqHz = frequency * 1_000_000; // MHz to Hz
      gain = 20;
      break;
    case 'am':
      freqHz = frequency * 1000; // kHz to Hz
      gain = 30;
      directSampling = true;
      break;
    case 'atc':
      freqHz = frequency * 1_000_000; // MHz to Hz
      gain = 30;
      break;
    default:
      res.status(400).json({ error: `Unknown mode: ${mode}` });
      return;
  }

  const args = [
    '-s', '240000',
    '-f', String(Math.round(freqHz)),
    '-g', String(gain),
    '-', // output to stdout
  ];

  if (directSampling) {
    // Direct sampling mode for HF/MF (AM broadcast band)
    // Mode 2 = Q-branch ADC input
    args.unshift('-D', '2');
  }

  console.log(`[RAWR-SDR] Tuning: ${rtlSdr} ${args.join(' ')} [mode=${mode}]`);

  try {
    activeProcess = spawn(rtlSdr, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    activeProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[rtl_sdr] ${msg}`);
    });

    // Process raw IQ data -> demodulate -> send PCM to clients
    const demod = (mode === 'am' || mode === 'atc') ? demodAM : demodFM;

    activeProcess.stdout?.on('data', (chunk: Buffer) => {
      // Demodulate raw IQ to 48kHz 16-bit PCM
      const pcm = demod(chunk);
      if (pcm.length > 0) {
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(pcm);
          }
        });
      }

      // For FM with redsea: also pipe raw data to redsea
      // (redsea needs the MPX signal, which we'd get from FM demod before decimation)
      // Note: redsea integration with rtl_sdr requires different pipeline
      // For now RDS works only if rtl_fm+redsea are available as fallback
    });

    activeProcess.on('error', (err) => {
      console.error(`[rtl_sdr] Error: ${err.message}`);
      activeProcess = null;
    });

    activeProcess.on('close', (code) => {
      console.log(`[rtl_sdr] Exited (code ${code})`);
      activeProcess = null;
    });

    res.json({ success: true, frequency, mode, freqHz, gain });
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

// ADS-B
app.post('/api/adsb/start', (_req, res) => {
  if (activeProcess) { activeProcess.kill('SIGTERM'); activeProcess = null; }
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
