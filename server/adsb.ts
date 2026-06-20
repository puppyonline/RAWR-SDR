/**
 * ADS-B Aircraft Tracker — hex-only local detection + planespotters.live enrichment.
 *
 * Local rtl_adsb captures Mode S messages but we only extract the ICAO hex address.
 * All telemetry (position, altitude, speed, callsign, squawk) is fetched live from
 * planespotters.live/api/radar/trace/{hex} which aggregates global ADS-B feeds.
 *
 * API:
 * - POST /api/adsb/start      → start rtl_adsb + enrichment
 * - POST /api/adsb/stop       → stop tracking
 * - GET  /api/adsb/aircraft   → current aircraft list with live data
 * - GET  /api/adsb/trace/:hex → full flight trace for map path rendering
 * - GET  /api/adsb/info/:hex  → aircraft details + photos
 */

import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import https from 'https';

const router = Router();
const USER_AGENT = 'Airwave/2.0 (local media hub; https://github.com/puppyonline/RAWR-SDR)';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Aircraft {
  hex: string;
  flight: string;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  verticalRate: number | null;
  squawk: string;
  category: string;
  seen: number;
  messages: number;
  lastUpdate: number;
}

interface AircraftInfo {
  hex: string;
  registration: string | null;
  type: string | null;
  icaoType: string | null;
  owner: string | null;
  airlineIata: string | null;
  airlineIcao: string | null;
  airlineLogo: string | null;
  airframeUrl: string | null;
  aircraftUrl: string | null;
  photo: string | null;
  photoLink: string | null;
  photographer: string | null;
  photos: Array<{ src: string; link: string; photographer: string }>;
}

// ─── State ─────────────────────────────────────────────────────────────────

let adsbProcess: ChildProcess | null = null;
let enrichInterval: ReturnType<typeof setInterval> | null = null;
const aircraftMap = new Map<string, Aircraft>();
const enrichTimestamps = new Map<string, number>();
const infoCache = new Map<string, { data: AircraftInfo; ts: number }>();

const ENRICH_INTERVAL_MS = 3000;    // Poll API every 3s
const ENRICH_COOLDOWN_MS = 10000;   // Per-hex cooldown
const STALE_TIMEOUT_MS = 120000;    // Remove aircraft after 2 min no signal
const INFO_CACHE_MS = 86400000;     // 24h cache for static aircraft info

// ─── HTTP Helper ───────────────────────────────────────────────────────────

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000, headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

// ─── Local Decoder (hex extraction only) ───────────────────────────────────

function decodeMessage(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('*') || !trimmed.endsWith(';')) return;
  const hex = trimmed.slice(1, -1);
  if (hex.length < 14) return;

  // Extract ICAO address from bytes 1-3
  const b1 = parseInt(hex.slice(2, 4), 16);
  const b2 = parseInt(hex.slice(4, 6), 16);
  const b3 = parseInt(hex.slice(6, 8), 16);
  const icao = ((b1 << 16) | (b2 << 8) | b3).toString(16).toLowerCase().padStart(6, '0');

  if (!icao || icao === '000000') return;

  let ac = aircraftMap.get(icao);
  if (!ac) {
    ac = {
      hex: icao, flight: '', lat: null, lon: null, altitude: null,
      speed: null, heading: null, verticalRate: null, squawk: '',
      category: '', seen: 0, messages: 0, lastUpdate: Date.now(),
    };
    aircraftMap.set(icao, ac);
  }
  ac.messages++;
  ac.lastUpdate = Date.now();
  ac.seen = 0;
}

// ─── Enrichment (fetch ALL data from planespotters.live) ───────────────────

async function enrichAircraft(ac: Aircraft): Promise<void> {
  const now = Date.now();
  const last = enrichTimestamps.get(ac.hex);
  if (last && (now - last) < ENRICH_COOLDOWN_MS) return;
  enrichTimestamps.set(ac.hex, now);

  try {
    const data = await fetchJSON(
      `https://planespotters.live/api/radar/trace/${ac.hex}`
    );
    if (!data?.trace?.length) return;

    // Latest trace point: [ts, lat, lon, alt, speed, heading, ?, vertRate, extended?, ...]
    const latest = data.trace[data.trace.length - 1];
    if (!Array.isArray(latest) || latest.length < 6) return;

    const [, lat, lon, alt, speed, heading, , vertRate, extended] = latest;

    if (typeof lat === 'number') ac.lat = Math.round(lat * 10000) / 10000;
    if (typeof lon === 'number') ac.lon = Math.round(lon * 10000) / 10000;
    if (typeof alt === 'number') ac.altitude = alt;
    else if (alt === 'ground') ac.altitude = 0;
    if (typeof speed === 'number') ac.speed = Math.round(speed);
    if (typeof heading === 'number') ac.heading = Math.round(heading);
    if (typeof vertRate === 'number') ac.verticalRate = vertRate;

    // Extended data has callsign, squawk, category
    if (extended && typeof extended === 'object') {
      if (extended.flight) ac.flight = extended.flight.trim();
      if (extended.squawk) ac.squawk = extended.squawk;
      if (extended.category) ac.category = extended.category;
    }

    // Fallback callsign from registration
    if (!ac.flight && data.r) ac.flight = data.r;
  } catch { /* API unavailable */ }
}

function startEnrichment() {
  if (enrichInterval) return;
  enrichInterval = setInterval(async () => {
    if (!adsbProcess) { stopEnrichment(); return; }

    // Enrich all aircraft, prioritizing those without position data
    const all = Array.from(aircraftMap.values());
    const needsData = all.filter((ac) => ac.lat === null);
    const hasData = all.filter((ac) => ac.lat !== null);

    // Prioritize: up to 8 without data, then 2 refreshes for existing
    const batch = [...needsData.slice(0, 8), ...hasData.slice(0, 2)];

    for (const ac of batch) {
      await enrichAircraft(ac);
    }
  }, ENRICH_INTERVAL_MS);
}

function stopEnrichment() {
  if (enrichInterval) { clearInterval(enrichInterval); enrichInterval = null; }
  enrichTimestamps.clear();
}

// ─── Routes ────────────────────────────────────────────────────────────────

router.post('/start', (_req: Request, res: Response) => {
  if (adsbProcess) {
    return res.json({ status: 'already running', aircraft: aircraftMap.size });
  }

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'rtl_adsb.exe' : 'rtl_adsb';

  adsbProcess = spawn(cmd, ['-d', '0', '-g', '42'], { stdio: ['pipe', 'pipe', 'pipe'] });

  adsbProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) decodeMessage(line);
    }
  });

  adsbProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[ADS-B] ${msg}`);
  });

  adsbProcess.on('error', (err) => {
    console.error(`[ADS-B] Error: ${err.message}`);
    adsbProcess = null;
  });

  adsbProcess.on('close', (code) => {
    console.log(`[ADS-B] Exited (code ${code})`);
    adsbProcess = null;
  });

  console.log('[ADS-B] Started (R820T, device 0, 1090 MHz, gain 42)');
  startEnrichment();
  res.json({ status: 'started' });
});

router.post('/stop', (_req: Request, res: Response) => {
  if (adsbProcess) {
    adsbProcess.kill('SIGTERM');
    adsbProcess = null;
    aircraftMap.clear();
    stopEnrichment();
    console.log('[ADS-B] Stopped');
  }
  res.json({ status: 'stopped' });
});

router.get('/aircraft', (_req: Request, res: Response) => {
  const now = Date.now();
  for (const [hex, ac] of aircraftMap) {
    ac.seen = Math.round((now - ac.lastUpdate) / 1000);
    if ((now - ac.lastUpdate) > STALE_TIMEOUT_MS) aircraftMap.delete(hex);
  }

  const list = Array.from(aircraftMap.values())
    .sort((a, b) => a.seen - b.seen)
    .map(({ hex, flight, lat, lon, altitude, speed, heading, verticalRate, squawk, category, seen, messages }) => ({
      hex, flight, lat, lon, altitude, speed, heading, verticalRate, squawk, category, seen, messages,
    }));

  res.json({
    count: list.length,
    aircraft: list,
    tracking: adsbProcess !== null,
  });
});

// GET /api/adsb/trace/:hex — full flight trace for map path rendering
router.get('/trace/:hex', async (req: Request, res: Response) => {
  const hex = req.params.hex.toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) {
    return res.status(400).json({ error: 'Invalid hex code' });
  }

  try {
    const data = await fetchJSON(`https://planespotters.live/api/radar/trace/${hex}`);
    if (!data?.trace) {
      return res.json({ hex, trace: [] });
    }

    // Extract position points: [lat, lon, alt, timestamp]
    const trace = data.trace
      .filter((t: any[]) => typeof t[1] === 'number' && typeof t[2] === 'number')
      .map((t: any[]) => ({
        ts: t[0],
        lat: t[1],
        lon: t[2],
        alt: typeof t[3] === 'number' ? t[3] : 0,
        speed: typeof t[4] === 'number' ? Math.round(t[4]) : null,
        heading: typeof t[5] === 'number' ? Math.round(t[5]) : null,
      }));

    res.json({
      hex,
      registration: data.r || null,
      type: data.t || null,
      description: data.desc || null,
      operator: data.ownOp || null,
      trace,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/adsb/info/:hex — aircraft details + photos
router.get('/info/:hex', async (req: Request, res: Response) => {
  const hex = req.params.hex.toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) {
    return res.status(400).json({ error: 'Invalid hex code' });
  }

  const cached = infoCache.get(hex);
  if (cached && (Date.now() - cached.ts) < INFO_CACHE_MS) {
    return res.json(cached.data);
  }

  const info: AircraftInfo = {
    hex, registration: null, type: null, icaoType: null,
    owner: null, airlineIata: null, airlineIcao: null,
    airlineLogo: null, airframeUrl: null, aircraftUrl: null,
    photo: null, photoLink: null, photographer: null, photos: [],
  };

  try {
    const data = await fetchJSON(`https://planespotters.live/api/aircraft/hex/${hex}`);
    const ac = data?.aircraft;
    if (ac) {
      info.registration = ac.reg || null;
      info.type = ac.aircraft_name || null;
      info.icaoType = ac.aircraft_code || null;
      info.owner = ac.airline_name || ac.ownOp || null;
      info.airlineIata = ac.airline_iata || null;
      info.airlineIcao = ac.airline_icao || null;
      info.airlineLogo = ac.airline_logo || null;
      info.airframeUrl = ac.url || null;
      info.aircraftUrl = ac.aircraft_url || null;
    }
    if (data?.photos?.length > 0) {
      info.photos = data.photos.map((p: any) => ({
        src: p.thumbnail_large?.src || p.thumbnail?.src || '',
        link: p.link || '',
        photographer: p.photographer || '',
      }));
      info.photo = info.photos[0].src || null;
      info.photoLink = info.photos[0].link || null;
      info.photographer = info.photos[0].photographer || null;
    }
  } catch { /* unavailable */ }

  infoCache.set(hex, { data: info, ts: Date.now() });
  res.json(info);
});

export default router;
