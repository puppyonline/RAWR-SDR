/**
 * HDHomeRun Flex 4K integration.
 *
 * API endpoints:
 * - GET /api/hdhr/discover   → find device on network
 * - GET /api/hdhr/lineup     → channel list with stream URLs
 * - GET /api/hdhr/guide      → EPG data from SiliconDust cloud
 * - GET /api/hdhr/stream/:ch → proxy MPEG-TS stream for a channel
 *
 * The Flex 4K HTTP API:
 * - http://<IP>/discover.json → device info + DeviceAuth
 * - http://<IP>/lineup.json   → channel lineup with stream URLs
 * - http://<IP>/auto/v<CH>    → MPEG-TS live stream
 * - https://api.hdhomerun.com/api/guide?DeviceAuth=<auth> → EPG (JSON)
 */

import { Router, Request, Response } from 'express';
import http from 'http';
import https from 'https';
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Find ffmpeg binary: try ffmpeg-static package first, then system PATH
let ffmpegPath = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
try {
  // Look for ffmpeg-static in node_modules
  const staticPath = path.resolve('node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  const staticPathUnix = path.resolve('node_modules', 'ffmpeg-static', 'ffmpeg');
  const candidate = process.platform === 'win32' ? staticPath : staticPathUnix;
  if (fs.existsSync(candidate)) {
    ffmpegPath = candidate;
  } else {
    // Try requiring it (handles different install locations)
    const resolved = path.resolve('node_modules', 'ffmpeg-static', 'index.js');
    if (fs.existsSync(resolved)) {
      // Read the package to find the binary path
      const pkg = JSON.parse(fs.readFileSync(path.resolve('node_modules', 'ffmpeg-static', 'package.json'), 'utf-8'));
      const binDir = path.resolve('node_modules', 'ffmpeg-static');
      const files = fs.readdirSync(binDir);
      const bin = files.find(f => f === 'ffmpeg' || f === 'ffmpeg.exe');
      if (bin) ffmpegPath = path.join(binDir, bin);
    }
  }
} catch { /* use system ffmpeg */ }
console.log(`[HDHR] ffmpeg path: ${ffmpegPath}`);

const router = Router();

let cachedDevice: any = null;
let cachedLineup: any[] = [];
let cachedGuide: any[] = [];
let guideLastFetch = 0;

const GUIDE_CACHE_MS = 15 * 60 * 1000; // 15 min cache

/**
 * Discover HDHomeRun on the local network.
 * Tries hdhomerun.local first, then falls back to broadcast discovery.
 */
async function discoverDevice(): Promise<any> {
  if (cachedDevice) return cachedDevice;

  const hosts = ['hdhomerun.local'];

  for (const host of hosts) {
    try {
      const data = await fetchJSON(`http://${host}/discover.json`);
      if (data && data.DeviceID) {
        cachedDevice = data;
        if (!cachedDevice.BaseURL) {
          cachedDevice.BaseURL = `http://${host}`;
        }
        console.log(`[HDHR] Found: ${data.FriendlyName} (${data.DeviceID}) at ${cachedDevice.BaseURL}`);
        return cachedDevice;
      }
    } catch { /* try next */ }
  }

  // Fallback: try cloud discovery API for IP
  try {
    const devices = await fetchJSON('https://ipv4-api.hdhomerun.com/discover');
    if (Array.isArray(devices) && devices.length > 0) {
      const dev = devices[0];
      cachedDevice = dev;
      if (!cachedDevice.BaseURL) {
        cachedDevice.BaseURL = dev.LocalIP ? `http://${dev.LocalIP}` : undefined;
      }
      console.log(`[HDHR] Found via cloud: ${dev.FriendlyName} at ${cachedDevice.BaseURL}`);
      return cachedDevice;
    }
  } catch { /* ignore */ }

  return null;
}

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 5000 }, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

// GET /api/hdhr/discover
router.get('/discover', async (_req: Request, res: Response) => {
  const device = await discoverDevice();
  if (!device) {
    return res.status(404).json({ error: 'No HDHomeRun found on network' });
  }
  res.json(device);
});

// GET /api/hdhr/lineup
router.get('/lineup', async (_req: Request, res: Response) => {
  const device = await discoverDevice();
  if (!device) return res.status(404).json({ error: 'No device' });

  try {
    const lineup = await fetchJSON(`${device.BaseURL}/lineup.json`);
    cachedLineup = lineup;
    res.json(lineup);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hdhr/guide
router.get('/guide', async (_req: Request, res: Response) => {
  const device = await discoverDevice();
  if (!device) return res.status(404).json({ error: 'No device' });

  // Cache guide data
  const now = Date.now();
  if (cachedGuide.length > 0 && (now - guideLastFetch) < GUIDE_CACHE_MS) {
    return res.json(cachedGuide);
  }

  try {
    const auth = device.DeviceAuth;
    if (!auth) return res.status(400).json({ error: 'No DeviceAuth' });

    const guide = await fetchJSON(`https://api.hdhomerun.com/api/guide?DeviceAuth=${encodeURIComponent(auth)}`);
    cachedGuide = guide;
    guideLastFetch = now;
    res.json(guide);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hdhr/stream/:channel
// Proxies the MPEG-TS stream from the HDHomeRun through ffmpeg for browser compatibility.
// ATSC OTA can be MPEG-2+AC3 which browsers don't support. ffmpeg transcodes to H.264+AAC.
router.get('/stream/:channel', async (req: Request, res: Response) => {
  const device = await discoverDevice();
  if (!device) return res.status(404).json({ error: 'No device' });

  const channel = req.params.channel;

  // Get stream URL from lineup
  let streamUrl = '';
  if (cachedLineup.length > 0) {
    const ch = cachedLineup.find((c: any) => c.GuideNumber === channel);
    if (ch?.URL) streamUrl = ch.URL;
  }
  if (!streamUrl) streamUrl = `${device.BaseURL}/auto/v${channel}`;

  console.log(`[HDHR] Streaming via ffmpeg: ${streamUrl}`);

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'keep-alive');

  // Transcode with ffmpeg: MPEG-2/AC-3 → H.264/AAC in MPEG-TS container
  const ffmpeg = spawn(ffmpegPath, [
    '-i', streamUrl,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-profile:v', 'baseline',    // most compatible H.264 profile
    '-level', '3.1',
    '-g', '30',                  // keyframe every 30 frames (1 sec at 30fps)
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',              // standard audio sample rate
    '-ac', '2',                  // stereo
    '-f', 'mpegts',
    '-mpegts_flags', 'resend_headers', // resend PAT/PMT periodically
    'pipe:1',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  ffmpeg.stdout?.pipe(res);

  ffmpeg.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    // Only log errors, not the constant progress output
    if (msg.includes('Error') || msg.includes('error')) {
      console.error(`[ffmpeg] ${msg.slice(0, 200)}`);
    }
  });

  ffmpeg.on('error', (err) => {
    console.error(`[ffmpeg] Spawn error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'ffmpeg not found. Install ffmpeg for TV streaming.' });
  });

  ffmpeg.on('close', (code) => {
    console.log(`[ffmpeg] Exited (code ${code})`);
    res.end();
  });

  req.on('close', () => {
    ffmpeg.kill('SIGTERM');
  });
});

// GET /api/hdhr/status
router.get('/status', async (_req: Request, res: Response) => {
  const device = await discoverDevice();
  if (!device) return res.json({ connected: false });

  try {
    const status = await fetchJSON(`${device.BaseURL}/status.json`);
    res.json({ connected: true, device, tuners: status });
  } catch {
    res.json({ connected: true, device, tuners: [] });
  }
});

export default router;

// Pre-fetch device info and lineup on startup for faster initial load
setTimeout(async () => {
  try {
    const device = await discoverDevice();
    if (device) {
      const lineup = await fetchJSON(`${device.BaseURL}/lineup.json`);
      cachedLineup = lineup;
      console.log(`[HDHR] Pre-fetched lineup: ${lineup.length} channels`);
    }
  } catch { /* non-critical */ }
}, 500);
