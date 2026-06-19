import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track active SDR processes
let activeProcess: ChildProcess | null = null;

// API Routes
app.get('/api/status', (_req, res) => {
  res.json({
    sdrConnected: true,
    device: 'RTL2832U',
    sampleRate: 2400000,
    gain: 'auto',
    activeMode: activeProcess ? 'active' : 'idle',
  });
});

app.post('/api/tune', (req, res) => {
  const { frequency, mode, sampleRate } = req.body;

  // Kill existing process if running
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }

  // Build rtl_fm command based on mode
  // On Windows: rtl_fm.exe should be in PATH
  const args: string[] = [];

  switch (mode) {
    case 'fm':
      args.push('-M', 'fm', '-f', `${frequency}M`, '-s', '200000', '-r', '48000');
      break;
    case 'am':
      args.push('-M', 'am', '-f', `${frequency}k`, '-s', '12000', '-r', '48000');
      break;
    case 'atc':
      args.push('-M', 'am', '-f', `${frequency}M`, '-s', '12000', '-r', '48000');
      break;
    case 'hd':
      args.push('-M', 'fm', '-f', `${frequency}M`, '-s', '1000000');
      break;
    default:
      args.push('-M', 'fm', '-f', `${frequency}M`, '-s', '200000', '-r', '48000');
  }

  if (sampleRate) {
    args.push('-s', String(sampleRate));
  }

  try {
    // Spawn rtl_fm (on Windows use rtl_fm.exe)
    const cmd = process.platform === 'win32' ? 'rtl_fm.exe' : 'rtl_fm';
    activeProcess = spawn(cmd, args);

    activeProcess.stdout?.on('data', (data: Buffer) => {
      // Broadcast raw audio to connected WebSocket clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    });

    activeProcess.stderr?.on('data', (data: Buffer) => {
      console.log(`[rtl_fm] ${data.toString()}`);
    });

    activeProcess.on('close', (code) => {
      console.log(`[rtl_fm] Process exited with code ${code}`);
      activeProcess = null;
    });

    res.json({ success: true, frequency, mode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start SDR process' });
  }
});

app.post('/api/stop', (_req, res) => {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }
  res.json({ success: true });
});

// ADS-B endpoint: starts dump1090 and streams data
app.post('/api/adsb/start', (_req, res) => {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }

  try {
    const cmd = process.platform === 'win32' ? 'dump1090.exe' : 'dump1090';
    activeProcess = spawn(cmd, ['--interactive', '--net', '--net-http-port', '8080']);

    activeProcess.on('close', (code) => {
      console.log(`[dump1090] exited with code ${code}`);
      activeProcess = null;
    });

    res.json({ success: true, message: 'ADS-B tracking started' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start dump1090' });
  }
});

app.post('/api/adsb/stop', (_req, res) => {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }
  res.json({ success: true });
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`[RAWR-SDR] Server running on http://localhost:${PORT}`);
});
