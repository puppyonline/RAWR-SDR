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

  const hosts = ['hdhomerun.local', '192.168.1.255'];

  for (const host of hosts) {
    try {
      const data = await fetchJSON(`http://${host}/discover.json`);
      if (data && data.DeviceID) {
        // Prefer the BaseURL from the device response, or use LocalIP
        cachedDevice = data;
        if (!cachedDevice.BaseURL) {
          cachedDevice.BaseURL = data.LocalIP ? `http://${data.LocalIP}` : `http://${host}`;
        }
        // Always prefer IP-based URL to avoid .local mDNS resolution issues
        if (data.LocalIP) {
          cachedDevice.BaseURL = `http://${data.LocalIP}`;
        }
        console.log(`[HDHR] Found: ${data.FriendlyName} (${data.DeviceID}) at ${cachedDevice.BaseURL}`);
        return cachedDevice;
      }
    } catch { /* try next */ }
  }

  // Try my.hdhomerun.com discovery
  try {
    const devices = await fetchJSON('https://ipv4-api.hdhomerun.com/discover');
    if (Array.isArray(devices) && devices.length > 0) {
      const dev = devices[0];
      cachedDevice = dev;
      cachedDevice.BaseURL = dev.BaseURL || `http://${dev.LocalIP}`;
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
// Proxies the MPEG-TS stream from the HDHomeRun to the browser.
// ATSC broadcasts are already H.264+AC3, which mpegts.js can demux.
router.get('/stream/:channel', async (req: Request, res: Response) => {
  const device = await discoverDevice();
  if (!device) return res.status(404).json({ error: 'No device' });

  const channel = req.params.channel;
  const streamUrl = `${device.BaseURL}/auto/v${channel}`;

  console.log(`[HDHR] Streaming: ${streamUrl}`);

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Transfer-Encoding', 'chunked');

  // Use a persistent connection to the HDHomeRun
  const options = new URL(streamUrl);
  const request = http.request({
    hostname: options.hostname,
    port: options.port || 80,
    path: options.pathname + options.search,
    method: 'GET',
    headers: { 'Connection': 'keep-alive' },
  }, (upstream) => {
    console.log(`[HDHR] Stream response: ${upstream.statusCode} ${upstream.headers['content-type'] || 'no content-type'}`);
    if (upstream.statusCode !== 200) {
      let body = '';
      upstream.on('data', (chunk) => { body += chunk.toString().slice(0, 200); });
      upstream.on('end', () => { console.log(`[HDHR] Stream error body: ${body}`); res.status(upstream.statusCode || 500).end(); });
      return;
    }
    upstream.pipe(res);
    upstream.on('error', () => res.end());
    upstream.on('end', () => { console.log('[HDHR] Stream ended'); res.end(); });
  });

  request.on('error', (err) => {
    console.error(`[HDHR] Stream error: ${err.message}`);
    if (!res.headersSent) res.status(500).end();
  });

  request.end();

  // Clean up when client disconnects
  req.on('close', () => {
    request.destroy();
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
