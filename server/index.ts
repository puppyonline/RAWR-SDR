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
let sdrDetected = false;

// Try to detect RTL-SDR device on startup
function detectSDR(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'rtl_test.exe -t' : 'rtl_test -t';
    execSync(cmd, { timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    // rtl_test returns non-zero even when device is found
    // Check stderr for "Found" string
    try {
      const cmd = process.platform === 'win32' ? 'rtl_test.exe -t' : 'rtl_test -t';
      const result = execSync(cmd, {
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
      return result.includes('Found') || result.includes('RTL');
    } catch (e: any) {
      const output = (e.stderr || e.stdout || '').toString();
      return output.includes('Found') || output.includes('RTL');
    }
  }
}

try {
  sdrDetected = detectSDR();
  console.log(`[RAWR-SDR] SDR device: ${sdrDetected ? 'DETECTED' : 'NOT FOUND'}`);
} catch {
  console.log('[RAWR-SDR] SDR detection failed');
}

// API: Device status
app.get('/api/status', (_req, res) => {
  res.json({
    sdrConnected: sdrDetected,
    device: sdrDetected ? 'RTL2832U R820T2' : 'No device',
    sampleRate: 2400000,
    gain: 'Auto',
    activeMode: activeProcess ? 'Streaming' : 'Idle',
  });
});

// API: Start tuning - spawns rtl_fm and pipes PCM audio over WebSocket
app.post('/api/tune', (req, res) => {
  const { frequency, mode } = req.body;

  // Kill existing process
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
  }

  const isWin = process.platform === 'win32';
  const rtlFm = isWin ? 'rtl_fm.exe' : 'rtl_fm';

  // Build args based on mode
  // rtl_fm outputs signed 16-bit PCM to stdout
  const args: string[] = ['-g', '40'];

  switch (mode) {
    case 'fm':
      // Wideband FM: 200kHz bandwidth, 48kHz output audio rate
      args.push('-M', 'fm', '-f', `${frequency}M`, '-s', '200000', '-r', '48000', '-l', '0');
      break;
    case 'am':
      // AM: frequency in kHz, narrower bandwidth
      args.push('-M', 'am', '-f', `${frequency}k`, '-s', '12000', '-r', '48000');
      break;
    case 'atc':
      // ATC is AM on VHF aviation band
      args.push('-M', 'am', '-f', `${frequency}M`, '-s', '12000', '-r', '48000');
      break;
    case 'hd':
      // HD Radio needs wider bandwidth for NRSC-5
      // Note: actual HD decoding requires nrsc5, rtl_fm just provides raw IQ
      args.push('-M', 'fm', '-f', `${frequency}M`, '-s', '200000', '-r', '48000');
      break;
    default:
      args.push('-M', 'fm', '-f', `${frequency}M`, '-s', '200000', '-r', '48000');
  }

  console.log(`[RAWR-SDR] Starting: ${rtlFm} ${args.join(' ')}`);

  try {
    activeProcess = spawn(rtlFm, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[rtl_fm] ${msg}`);
    });

    // Stream PCM audio data to all connected WebSocket clients
    // rtl_fm outputs raw signed 16-bit little-endian PCM at the specified sample rate
    activeProcess.stdout?.on('data', (data: Buffer) => {
      // Send raw PCM chunks to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    });

    activeProcess.on('error', (err) => {
      console.error(`[rtl_fm] Failed to start: ${err.message}`);
      activeProcess = null;
    });

    activeProcess.on('close', (code) => {
      console.log(`[rtl_fm] Exited with code ${code}`);
      activeProcess = null;
    });

    res.json({ success: true, frequency, mode, args: args.join(' ') });
  } catch (err: any) {
    console.error(`[RAWR-SDR] Error: ${err.message}`);
    res.status(500).json({ error: `Failed to start rtl_fm: ${err.message}` });
  }
});

// API: Stop current stream
app.post('/api/stop', (_req, res) => {
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
    console.log('[RAWR-SDR] Stopped active process');
  }
  res.json({ success: true });
});

// API: ADS-B start (dump1090)
app.post('/api/adsb/start', (_req, res) => {
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
  }

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'dump1090.exe' : 'dump1090';

  try {
    activeProcess = spawn(cmd, ['--interactive', '--net'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeProcess.on('error', (err) => {
      console.error(`[dump1090] Failed: ${err.message}`);
      activeProcess = null;
    });

    activeProcess.on('close', (code) => {
      console.log(`[dump1090] Exited with code ${code}`);
      activeProcess = null;
    });

    res.json({ success: true, message: 'ADS-B tracking started on 1090 MHz' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to start dump1090: ${err.message}` });
  }
});

app.post('/api/adsb/stop', (_req, res) => {
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
  }
  res.json({ success: true });
});

// WebSocket connections
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    // If no more clients, optionally stop streaming
    if (wss.clients.size === 0 && activeProcess) {
      console.log('[WS] No clients remaining, stopping SDR');
      activeProcess.kill('SIGTERM');
      activeProcess = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`[RAWR-SDR] Server running at http://localhost:${PORT}`);
  console.log(`[RAWR-SDR] WebSocket endpoint: ws://localhost:${PORT}/ws`);
  if (!sdrDetected) {
    console.log('[RAWR-SDR] WARNING: No RTL-SDR device detected. Install drivers and connect device.');
  }
});
