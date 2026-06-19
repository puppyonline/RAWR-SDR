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

try {
  sdrDetected = detectSDR();
  console.log(`[RAWR-SDR] Device: ${sdrDetected ? 'DETECTED' : 'NOT FOUND'}`);
} catch {
  console.log('[RAWR-SDR] Device detection skipped');
}

// Status endpoint
app.get('/api/status', (_req, res) => {
  res.json({
    sdrConnected: sdrDetected,
    device: sdrDetected ? 'RTL2832U R820T2' : 'No device',
    sampleRate: 2400000,
    gain: 'Auto',
    activeMode: activeProcess ? 'Streaming' : 'Idle',
  });
});

/**
 * Tuning endpoint.
 *
 * Band-specific rtl_fm parameters:
 *
 * FM BROADCAST (87.5-108 MHz):
 *   - Modulation: wbfm (wideband FM)
 *   - Channel bandwidth: ~200 kHz
 *   - Audio sample rate: 48 kHz (resampled from 32k internal)
 *   - De-emphasis filter enabled (75us in NA, 50us in EU)
 *   - rtl_fm uses -M wbfm which internally sets -s 170k -o 4 -A fast -r 32k -E deemp
 *   - We override -r to 48000 for our AudioContext
 *
 * AM BROADCAST (530-1700 kHz):
 *   - Modulation: am
 *   - Requires DIRECT SAMPLING mode (-E direct) because the R820T/R820T2
 *     tuner chip only works down to ~24 MHz. Direct sampling bypasses the
 *     tuner and samples the ADC input directly (Q-branch), allowing
 *     reception of 0.5-28.8 MHz.
 *   - Channel bandwidth: 10 kHz (AM channels are spaced 10 kHz in NA)
 *   - Sample rate: 12 kHz for narrowband, resampled to 48 kHz output
 *   - Frequency specified in kHz (e.g., 880k for 880 kHz)
 *
 * ATC / AVIATION (118.000-136.975 MHz):
 *   - Modulation: am (aviation uses AM on VHF)
 *   - Channel spacing: 25 kHz (legacy) or 8.33 kHz (newer)
 *   - Sample rate: 12 kHz narrowband
 *   - Squelch enabled (-l) to silence noise between transmissions
 *   - Output resampled to 48 kHz
 *   - PPM correction recommended for accuracy at these frequencies
 *
 * HD RADIO (87.5-108 MHz):
 *   - Uses same FM band but digital sidebands (NRSC-5)
 *   - rtl_fm can only demodulate analog; for true HD you'd need nrsc5
 *   - We tune as wideband FM for analog fallback
 */
app.post('/api/tune', async (req, res) => {
  const { frequency, mode, squelch } = req.body;

  // Kill existing process and wait for USB device release
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
    // Windows needs time to release the USB device handle
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  const isWin = process.platform === 'win32';
  const rtlFm = isWin ? 'rtl_fm.exe' : 'rtl_fm';
  const args: string[] = [];

  switch (mode) {
    case 'fm':
      // Wideband FM broadcast
      // -E deemp applies proper 75µs de-emphasis in the demodulator
      // (more accurate than client-side approximation)
      args.push(
        '-M', 'fm',
        '-f', `${frequency}M`,
        '-s', '192k',
        '-r', '48000',
        '-l', '0',
        '-E', 'deemp',
        '-g', '20',
      );
      break;

    case 'am':
      // AM broadcast band - REQUIRES direct sampling
      // The RTL2832U ADC runs at 28.8 MHz, so direct sampling covers 0-14.4 MHz
      // AM broadcast is 530-1700 kHz, well within range
      args.push(
        '-M', 'am',
        '-f', `${frequency}k`,
        '-s', '12k',
        '-r', '48000',
        '-l', '0',
        '-g', '0',             // AGC
        '-E', 'direct',
      );
      break;

    case 'atc':
      // Aviation VHF AM
      // Standard tuner works fine at 118-137 MHz (R820T range is 24-1766 MHz)
      // Aviation uses AM modulation with 25 kHz channel spacing
      args.push(
        '-M', 'am',
        '-f', `${frequency}M`,
        '-s', '12k',
        '-r', '48000',
        '-l', String(squelch || 50),
        '-g', '0',             // AGC
        '-p', '0',
      );
      break;

    case 'hd':
      args.push(
        '-M', 'fm',
        '-f', `${frequency}M`,
        '-s', '192k',
        '-r', '48000',
        '-l', '0',
        '-E', 'deemp',
        '-g', '20',
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

    // rtl_fm outputs raw signed 16-bit little-endian PCM on stdout
    // at the rate specified by -r (48000 Hz)
    activeProcess.stdout?.on('data', (chunk: Buffer) => {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(chunk);
        }
      });
    });

    activeProcess.on('error', (err) => {
      console.error(`[rtl_fm] Spawn error: ${err.message}`);
      activeProcess = null;
    });

    activeProcess.on('close', (code) => {
      console.log(`[rtl_fm] Process exited (code ${code})`);
      activeProcess = null;
    });

    res.json({ success: true, frequency, mode, command: `${rtlFm} ${args.join(' ')}` });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to start: ${err.message}` });
  }
});

// Stop streaming
app.post('/api/stop', (_req, res) => {
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
    console.log('[RAWR-SDR] Stream stopped');
  }
  res.json({ success: true });
});

// ADS-B tracking via dump1090
app.post('/api/adsb/start', (_req, res) => {
  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
  }

  const cmd = process.platform === 'win32' ? 'dump1090.exe' : 'dump1090';
  try {
    activeProcess = spawn(cmd, ['--interactive', '--net'], { stdio: ['pipe', 'pipe', 'pipe'] });

    activeProcess.on('error', (err) => {
      console.error(`[dump1090] Error: ${err.message}`);
      activeProcess = null;
    });

    activeProcess.on('close', (code) => {
      console.log(`[dump1090] Exited (code ${code})`);
      activeProcess = null;
    });

    res.json({ success: true });
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

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    if (wss.clients.size === 0 && activeProcess) {
      console.log('[WS] No clients, stopping stream');
      activeProcess.kill('SIGTERM');
      activeProcess = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`[RAWR-SDR] Server: http://localhost:${PORT}`);
  console.log(`[RAWR-SDR] WS: ws://localhost:${PORT}/ws`);
  if (!sdrDetected) {
    console.log('[RAWR-SDR] No RTL-SDR detected. Ensure rtl_fm is in PATH.');
  }
});
