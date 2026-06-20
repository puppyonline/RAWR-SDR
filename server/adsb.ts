/**
 * ADS-B Aircraft Tracker using dump1090 + R820T dongle (device 0).
 *
 * dump1090 is a full Mode S decoder with error correction, CPR position
 * decoding, and multi-message correlation. It serves decoded aircraft
 * data as JSON over HTTP which we poll.
 *
 * Setup: download dump1090 for Windows from:
 * https://github.com/gvanem/Dump1090/releases or
 * https://github.com/tpainter/dump1090_win/releases
 * Place dump1090.exe in PATH or the project root.
 *
 * API:
 * - POST /api/adsb/start  → launch dump1090 on device 0
 * - POST /api/adsb/stop   → kill dump1090
 * - GET  /api/adsb/aircraft → current aircraft (from dump1090 JSON)
 */

import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

const router = Router();

let dump1090Process: ChildProcess | null = null;
let lastAircraftData: any = null;
let lastFetchTime = 0;
const POLL_INTERVAL = 800; // ms between polls to dump1090

// dump1090 serves JSON at http://localhost:8080/data/aircraft.json (newer forks)
// or http://localhost:8080/data.json (original antirez version)
const DUMP1090_URLS = [
  'http://localhost:8080/data/aircraft.json',
  'http://localhost:8080/data.json',
  'http://localhost:30003/', // SBS format fallback (we won't use this)
];

function fetchDump1090Data(): Promise<any> {
  return new Promise((resolve, reject) => {
    // Try the standard aircraft.json endpoint
    const url = 'http://localhost:8080/data/aircraft.json';
    http.get(url, { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) {
        // Try alternate URL
        http.get('http://localhost:8080/data.json', { timeout: 2000 }, (res2) => {
          let d = '';
          res2.on('data', (chunk) => { d += chunk; });
          res2.on('end', () => {
            try { resolve(JSON.parse(d)); }
            catch { reject(new Error('Invalid JSON')); }
          });
        }).on('error', reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', (err) => {
      // Try alternate
      http.get('http://localhost:8080/data.json', { timeout: 2000 }, (res2) => {
        if (res2.statusCode !== 200) { reject(err); return; }
        let d = '';
        res2.on('data', (chunk) => { d += chunk; });
        res2.on('end', () => {
          try { resolve(JSON.parse(d)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      }).on('error', reject);
    });
  });
}

// Background polling of dump1090's JSON
let pollInterval: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    try {
      const data = await fetchDump1090Data();
      lastAircraftData = data;
      lastFetchTime = Date.now();
    } catch {
      // dump1090 might not be ready yet, or using different format
    }
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// POST /api/adsb/start
router.post('/start', (_req: Request, res: Response) => {
  if (dump1090Process) {
    return res.json({ status: 'already running' });
  }

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'dump1090.exe' : 'dump1090';

  // Launch dump1090 with:
  // --device-index 0: R820T Mini
  // --gain 42: max gain for weak 1090 MHz signals
  // --net: enable HTTP/JSON output on port 8080
  // --net-http-port 8080: explicit port
  // --quiet: suppress interactive output
  // --fix: enable error correction (1-bit and 2-bit)
  // --aggressive: use more aggressive message decoding
  const args = [
    '--device-index', '0',
    '--gain', '42',
    '--net',
    '--net-http-port', '8080',
    '--quiet',
    '--fix',
    '--aggressive',
  ];

  console.log(`[ADS-B] Starting: ${cmd} ${args.join(' ')}`);
  dump1090Process = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

  dump1090Process.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('Hex')) console.log(`[ADS-B] ${msg.slice(0, 100)}`);
  });

  dump1090Process.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg && msg.includes('Aircraft')) console.log(`[ADS-B] ${msg.slice(0, 80)}`);
  });

  dump1090Process.on('error', (err) => {
    console.error(`[ADS-B] Failed to start dump1090: ${err.message}`);
    console.error('[ADS-B] Make sure dump1090.exe is in PATH or project root');
    dump1090Process = null;
  });

  dump1090Process.on('close', (code) => {
    console.log(`[ADS-B] dump1090 exited (code ${code})`);
    dump1090Process = null;
    stopPolling();
  });

  // Start polling after a short delay to let dump1090 initialize
  setTimeout(() => startPolling(), 1500);

  res.json({ status: 'started' });
});

// POST /api/adsb/stop
router.post('/stop', (_req: Request, res: Response) => {
  if (dump1090Process) {
    dump1090Process.kill('SIGTERM');
    // On Windows, SIGTERM doesn't always work
    setTimeout(() => {
      if (dump1090Process) {
        try { dump1090Process.kill('SIGKILL'); } catch {}
      }
    }, 2000);
    dump1090Process = null;
    stopPolling();
    lastAircraftData = null;
    console.log('[ADS-B] Stopped');
  }
  res.json({ status: 'stopped' });
});

// GET /api/adsb/aircraft
router.get('/aircraft', (_req: Request, res: Response) => {
  if (!dump1090Process) {
    return res.json({ count: 0, aircraft: [], tracking: false, messages: 0 });
  }

  if (!lastAircraftData) {
    return res.json({ count: 0, aircraft: [], tracking: true, messages: 0 });
  }

  // dump1090 JSON format varies by fork but typically:
  // { aircraft: [...], messages: N, now: timestamp }
  // Each aircraft: { hex, flight, lat, lon, altitude, speed, track, squawk, seen, messages, ... }
  const raw = lastAircraftData;
  const aircraftList = (raw.aircraft || raw || [])
    .filter((ac: any) => ac.hex && ac.seen < 60)
    .map((ac: any) => ({
      hex: (ac.hex || '').toUpperCase(),
      flight: (ac.flight || '').trim(),
      lat: ac.lat ?? ac.latitude ?? null,
      lon: ac.lon ?? ac.longitude ?? null,
      altitude: ac.altitude ?? ac.alt_baro ?? ac.alt ?? null,
      speed: ac.speed ?? ac.gs ?? null,
      heading: ac.track ?? ac.heading ?? null,
      verticalRate: ac.vert_rate ?? ac.vr ?? null,
      squawk: ac.squawk || '',
      seen: ac.seen ?? 0,
      messages: ac.messages ?? ac.msgs ?? 0,
      rssi: ac.rssi ?? null,
      category: ac.category || '',
      emergency: ac.emergency || '',
    }))
    .sort((a: any, b: any) => a.seen - b.seen);

  res.json({
    count: aircraftList.length,
    aircraft: aircraftList,
    tracking: true,
    messages: raw.messages || 0,
    lastUpdate: lastFetchTime,
  });
});

export default router;
