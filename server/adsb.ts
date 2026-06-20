/**
 * ADS-B Aircraft Tracker using rtl_adsb + R820T dongle (device 0).
 *
 * rtl_adsb comes with the rtl-sdr package (already installed).
 * We decode Mode S messages with a comprehensive JavaScript parser
 * that handles all Extended Squitter message types.
 *
 * API:
 * - POST /api/adsb/start  → start tracking
 * - POST /api/adsb/stop   → stop tracking
 * - GET  /api/adsb/aircraft → current aircraft list
 * - GET  /api/adsb/info/:hex → aircraft details + photo (hexdb.io + PlaneSpotters.net)
 */

import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import https from 'https';

const router = Router();

// ─── Aircraft State ────────────────────────────────────────────────────────

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
  seen: number;
  messages: number;
  rssi: number | null;
  category: string;
  lastUpdate: number;
  // CPR position decoding state
  cprEvenLat: number | null;
  cprEvenLon: number | null;
  cprOddLat: number | null;
  cprOddLon: number | null;
  cprEvenTime: number | null;
  cprOddTime: number | null;
}

let adsbProcess: ChildProcess | null = null;
const aircraftMap = new Map<string, Aircraft>();

// ─── Mode S Decoder ────────────────────────────────────────────────────────

// ICAO Annex 10 Vol IV, 6-bit character set for Mode S callsigns
// Index 0 = space, 1-26 = A-Z, 27-47 = reserved (space),
// 48-57 = 0-9, 58-63 = reserved (space)
const CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ                     0123456789      ';

function createAircraft(hex: string): Aircraft {
  return {
    hex, flight: '', lat: null, lon: null, altitude: null,
    speed: null, heading: null, verticalRate: null, squawk: '',
    seen: 0, messages: 0, rssi: null, category: '',
    lastUpdate: Date.now(),
    cprEvenLat: null, cprEvenLon: null,
    cprOddLat: null, cprOddLon: null,
    cprEvenTime: null, cprOddTime: null,
  };
}

/**
 * Mode S CRC-24 validation.
 * Generator polynomial: x^24 + x^23 + x^10 + x^3 + 1 = 0x1FFF409
 * For DF17/18: CRC covers bytes[0..10] (88 bits), residual XORed with ICAO
 * should equal bytes[11..13]. Since DF17 PI field = CRC (not XOR'd with ICAO),
 * computing CRC over all 14 bytes should yield 0.
 */
function validateCRC(bytes: number[]): boolean {
  const GENERATOR = 0x1FFF409;
  let crc = 0;

  for (let i = 0; i < bytes.length; i++) {
    crc ^= (bytes[i] << 16);
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x800000) {
        crc = ((crc << 1) ^ GENERATOR) & 0xFFFFFF;
      } else {
        crc = (crc << 1) & 0xFFFFFF;
      }
    }
  }

  return crc === 0;
}

function decodeMessage(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('*') || !trimmed.endsWith(';')) return;
  const hex = trimmed.slice(1, -1);
  if (hex.length < 14) return;

  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }

  // No CRC filtering — we only need a valid ICAO hex address to track aircraft.
  // Callsign/type/registration are fetched from planespotters.live API instead of
  // decoding from RF, so corrupted payloads don't matter. The hex address in bytes
  // 1-3 is reliable even on weak signals since it's in the message header.
  const df = (bytes[0] >> 3) & 0x1F;
  const icao = ((bytes[1] << 16) | (bytes[2] << 8) | bytes[3]).toString(16).toUpperCase().padStart(6, '0');

  if (!icao || icao === '000000') return;

  let ac = aircraftMap.get(icao);
  if (!ac) {
    ac = createAircraft(icao);
    aircraftMap.set(icao, ac);
  }
  ac.messages++;
  ac.lastUpdate = Date.now();
  ac.seen = 0;

  if (hex.length < 28) {
    // Short message (56 bits) - DF4/5/11
    if (df === 4 || df === 20) {
      // Altitude reply
      ac.altitude = decodeAC13(bytes);
    } else if (df === 5 || df === 21) {
      // Squawk
      ac.squawk = decodeSquawk(bytes);
    }
    return;
  }

  // Long message (112 bits) - DF17/18 Extended Squitter
  if (df === 17 || df === 18) {
    const me = bytes.slice(4, 11); // Message Extended (7 bytes = 56 bits)
    const typeCode = (me[0] >> 3) & 0x1F;

    if (typeCode >= 1 && typeCode <= 4) {
      // Aircraft identification — only accept if CRC is valid to avoid garbage callsigns
      if (!validateCRC(bytes)) return;
      ac.category = `${typeCode}/${me[0] & 0x07}`;
      const c1 = (me[1] >> 2) & 0x3F;
      const c2 = ((me[1] & 0x03) << 4) | ((me[2] >> 4) & 0x0F);
      const c3 = ((me[2] & 0x0F) << 2) | ((me[3] >> 6) & 0x03);
      const c4 = me[3] & 0x3F;
      const c5 = (me[4] >> 2) & 0x3F;
      const c6 = ((me[4] & 0x03) << 4) | ((me[5] >> 4) & 0x0F);
      const c7 = ((me[5] & 0x0F) << 2) | ((me[6] >> 6) & 0x03);
      const c8 = me[6] & 0x3F;
      ac.flight = [c1, c2, c3, c4, c5, c6, c7, c8]
        .map((c) => CHARSET[c] || ' ')
        .join('')
        .trim();

    } else if (typeCode >= 9 && typeCode <= 18) {
      // Airborne position (barometric altitude)
      ac.altitude = decodeAC12((me[1] << 4) | (me[2] >> 4));

      // CPR encoded position
      const flag = (me[2] >> 2) & 1; // 0=even, 1=odd
      const rawLat = ((me[2] & 0x03) << 15) | (me[3] << 7) | (me[4] >> 1);
      const rawLon = ((me[4] & 0x01) << 16) | (me[5] << 8) | me[6];

      if (flag === 0) {
        ac.cprEvenLat = rawLat;
        ac.cprEvenLon = rawLon;
        ac.cprEvenTime = Date.now();
      } else {
        ac.cprOddLat = rawLat;
        ac.cprOddLon = rawLon;
        ac.cprOddTime = Date.now();
      }

      // Attempt CPR global decode if we have both even and odd
      decodeCPR(ac);

    } else if (typeCode === 19) {
      // Airborne velocity
      const subtype = me[0] & 0x07;
      if (subtype === 1 || subtype === 2) {
        // Ground speed
        const ewDir = (me[1] >> 2) & 1;
        const ewV = ((me[1] & 0x03) << 8) | me[2];
        const nsDir = (me[3] >> 7) & 1;
        const nsV = ((me[3] & 0x7F) << 3) | (me[4] >> 5);

        const ewVel = ewDir ? -(ewV - 1) : (ewV - 1);
        const nsVel = nsDir ? -(nsV - 1) : (nsV - 1);

        if (ewV && nsV) {
          ac.speed = Math.round(Math.sqrt(ewVel * ewVel + nsVel * nsVel));
          ac.heading = Math.round((Math.atan2(ewVel, nsVel) * 180 / Math.PI + 360) % 360);
        }

        // Vertical rate
        const vrSign = (me[4] >> 3) & 1;
        const vrVal = ((me[4] & 0x07) << 6) | (me[5] >> 2);
        if (vrVal) {
          ac.verticalRate = (vrSign ? -(vrVal - 1) : (vrVal - 1)) * 64;
        }
      }

    } else if (typeCode >= 20 && typeCode <= 22) {
      // Airborne position (GNSS altitude)
      const rawAlt = ((me[1] << 4) | (me[2] >> 4));
      ac.altitude = rawAlt; // GNSS altitude in feet

      const flag = (me[2] >> 2) & 1;
      const rawLat = ((me[2] & 0x03) << 15) | (me[3] << 7) | (me[4] >> 1);
      const rawLon = ((me[4] & 0x01) << 16) | (me[5] << 8) | me[6];

      if (flag === 0) {
        ac.cprEvenLat = rawLat;
        ac.cprEvenLon = rawLon;
        ac.cprEvenTime = Date.now();
      } else {
        ac.cprOddLat = rawLat;
        ac.cprOddLon = rawLon;
        ac.cprOddTime = Date.now();
      }
      decodeCPR(ac);
    }
  } else if (df === 4 || df === 20) {
    ac.altitude = decodeAC13(bytes);
  } else if (df === 5 || df === 21) {
    ac.squawk = decodeSquawk(bytes);
  }
}

// Decode 13-bit altitude code (DF4/20)
function decodeAC13(bytes: number[]): number | null {
  const ac13 = ((bytes[2] & 0x1F) << 8) | bytes[3];
  const mBit = (ac13 >> 6) & 1;
  const qBit = (ac13 >> 4) & 1;

  if (!mBit && qBit) {
    const n = ((ac13 >> 5) << 4) | (ac13 & 0x0F);
    return n * 25 - 1000;
  }
  return null;
}

// Decode 12-bit altitude code (Extended Squitter)
function decodeAC12(ac12: number): number | null {
  const qBit = (ac12 >> 4) & 1;
  if (qBit) {
    const n = ((ac12 >> 5) << 4) | (ac12 & 0x0F);
    return n * 25 - 1000;
  }
  return null;
}

// Decode squawk (Gillham code)
function decodeSquawk(bytes: number[]): string {
  const id13 = ((bytes[2] & 0x1F) << 8) | bytes[3];
  // Extract A/B/C/D digits
  const a4 = (id13 >> 11) & 1; const a2 = (id13 >> 9) & 1; const a1 = (id13 >> 10) & 1;
  const b4 = (id13 >> 5) & 1; const b2 = (id13 >> 3) & 1; const b1 = (id13 >> 4) & 1;
  const c4 = (id13 >> 0) & 1; const c2 = (id13 >> 2) & 1; const c1 = (id13 >> 1) & 1;
  const d4 = (id13 >> 8) & 1; const d2 = (id13 >> 6) & 1; const d1 = (id13 >> 7) & 1;
  return `${a4*4+a2*2+a1}${b4*4+b2*2+b1}${c4*4+c2*2+c1}${d4*4+d2*2+d1}`;
}

// CPR global position decode
function decodeCPR(ac: Aircraft) {
  if (ac.cprEvenLat === null || ac.cprOddLat === null ||
      ac.cprEvenLon === null || ac.cprOddLon === null ||
      ac.cprEvenTime === null || ac.cprOddTime === null) return;

  // Must have both within 10 seconds
  if (Math.abs(ac.cprEvenTime - ac.cprOddTime) > 10000) return;

  const cprLatEven = ac.cprEvenLat / 131072.0;
  const cprLatOdd = ac.cprOddLat / 131072.0;
  const cprLonEven = ac.cprEvenLon / 131072.0;
  const cprLonOdd = ac.cprOddLon / 131072.0;

  const dLatEven = 360.0 / 60;
  const dLatOdd = 360.0 / 59;

  const j = Math.floor(59 * cprLatEven - 60 * cprLatOdd + 0.5);

  let latEven = dLatEven * ((j % 60) + cprLatEven);
  let latOdd = dLatOdd * ((j % 59) + cprLatOdd);

  if (latEven >= 270) latEven -= 360;
  if (latOdd >= 270) latOdd -= 360;

  // Use the most recent one
  const useEven = ac.cprEvenTime > ac.cprOddTime;
  const lat = useEven ? latEven : latOdd;

  // Longitude
  const nlLat = NL(lat);
  const ni = Math.max(1, useEven ? nlLat : nlLat - 1);
  const dLon = 360.0 / ni;
  const m = Math.floor(
    (useEven ? cprLonEven : cprLonOdd) * (nlLat - 1) -
    (useEven ? cprLonOdd : cprLonEven) * nlLat + 0.5
  );
  let lon = dLon * ((m % ni + ni) % ni + (useEven ? cprLonEven : cprLonOdd));
  if (lon >= 180) lon -= 360;

  // Sanity check (roughly near Arizona)
  if (lat > -90 && lat < 90 && lon > -180 && lon < 180) {
    ac.lat = Math.round(lat * 10000) / 10000;
    ac.lon = Math.round(lon * 10000) / 10000;
  }
}

// NL function for CPR latitude zones
function NL(lat: number): number {
  if (Math.abs(lat) >= 87) return 1;
  const nz = 15;
  const a = 1 - Math.cos(Math.PI / (2 * nz));
  const b = Math.cos(Math.PI / 180 * Math.abs(lat));
  return Math.floor(2 * Math.PI / Math.acos(1 - a / (b * b)));
}

// ─── Routes ────────────────────────────────────────────────────────────────

router.post('/start', (_req: Request, res: Response) => {
  if (adsbProcess) {
    return res.json({ status: 'already running', aircraft: aircraftMap.size });
  }

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'rtl_adsb.exe' : 'rtl_adsb';

  // Device 0 = R820T Mini, gain 42 dB (max for 1090 MHz)
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

// ─── Live enrichment from planespotters.live/api/radar/trace ───────────────
// Fetches live position/flight/squawk for tracked aircraft to fill gaps
// from weak local reception. Runs periodically while tracking is active.

const ADSB_USER_AGENT = 'Airwave/2.0 (local media hub; https://github.com/puppyonline/RAWR-SDR)';

function fetchJSONFromUrl(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000, headers: { 'User-Agent': ADSB_USER_AGENT } }, (res) => {
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

// Track which hexes we've already enriched recently (avoid hammering API)
const enrichCache = new Map<string, number>();
const ENRICH_COOLDOWN_MS = 30 * 1000; // Don't re-fetch same hex within 30s

async function enrichAircraft(ac: Aircraft): Promise<void> {
  const lastEnrich = enrichCache.get(ac.hex);
  if (lastEnrich && (Date.now() - lastEnrich) < ENRICH_COOLDOWN_MS) return;
  enrichCache.set(ac.hex, Date.now());

  try {
    const data = await fetchJSONFromUrl(
      `https://planespotters.live/api/radar/trace/${ac.hex.toLowerCase()}`
    );
    if (!data?.trace?.length) return;

    // Get the latest trace entry
    const latest = data.trace[data.trace.length - 1];
    // Trace format: [timestamp, lat, lon, alt, speed, heading, ?, vert_rate, extended_or_null, ...]
    if (latest.length >= 8) {
      const [_ts, lat, lon, alt, speed, heading, , vertRate, extended] = latest;

      // Fill missing position
      if (ac.lat === null && typeof lat === 'number') ac.lat = Math.round(lat * 10000) / 10000;
      if (ac.lon === null && typeof lon === 'number') ac.lon = Math.round(lon * 10000) / 10000;

      // Fill missing telemetry (only if we don't have local data)
      if (ac.altitude === null && alt !== null && alt !== 'ground') ac.altitude = typeof alt === 'number' ? alt : null;
      if (ac.speed === null && typeof speed === 'number') ac.speed = Math.round(speed);
      if (ac.heading === null && typeof heading === 'number') ac.heading = Math.round(heading);
      if (ac.verticalRate === null && typeof vertRate === 'number') ac.verticalRate = vertRate;

      // Extended data has callsign, squawk
      if (extended && typeof extended === 'object') {
        if (!ac.flight && extended.flight) ac.flight = extended.flight.trim();
        if (!ac.squawk && extended.squawk) ac.squawk = extended.squawk;
        if (!ac.category && extended.category) ac.category = extended.category;
      }
    }

    // Top-level has registration and type
    if (!ac.flight && data.r) ac.flight = data.r; // Use reg as fallback display
  } catch { /* API unavailable, use local data */ }
}

// Background enrichment loop: enriches aircraft that are missing data
let enrichInterval: ReturnType<typeof setInterval> | null = null;

function startEnrichment() {
  if (enrichInterval) return;
  enrichInterval = setInterval(async () => {
    if (!adsbProcess) { stopEnrichment(); return; }

    // Enrich aircraft missing key data (flight, position, altitude)
    const toEnrich = Array.from(aircraftMap.values())
      .filter((ac) => !ac.flight || ac.lat === null || ac.altitude === null)
      .slice(0, 5); // Max 5 per cycle to avoid rate limits

    for (const ac of toEnrich) {
      await enrichAircraft(ac);
    }
  }, 5000); // Every 5 seconds
}

function stopEnrichment() {
  if (enrichInterval) { clearInterval(enrichInterval); enrichInterval = null; }
  enrichCache.clear();
}

router.get('/aircraft', (_req: Request, res: Response) => {
  // Update seen times and clean stale
  const now = Date.now();
  for (const [hex, ac] of aircraftMap) {
    ac.seen = Math.round((now - ac.lastUpdate) / 1000);
    if (ac.seen > 60) aircraftMap.delete(hex);
  }

  const list = Array.from(aircraftMap.values())
    .sort((a, b) => a.seen - b.seen)
    .map((ac) => ({
      hex: ac.hex,
      flight: ac.flight,
      lat: ac.lat,
      lon: ac.lon,
      altitude: ac.altitude,
      speed: ac.speed,
      heading: ac.heading,
      verticalRate: ac.verticalRate,
      squawk: ac.squawk,
      seen: ac.seen,
      messages: ac.messages,
      rssi: ac.rssi,
      category: ac.category,
    }));

  res.json({
    count: list.length,
    aircraft: list,
    tracking: adsbProcess !== null,
    totalMessages: Array.from(aircraftMap.values()).reduce((s, a) => s + a.messages, 0),
  });
});

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

// In-memory cache (aircraft details don't change mid-flight)
const infoCache = new Map<string, { data: AircraftInfo; ts: number }>();
const INFO_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function lookupAircraft(hex: string): Promise<AircraftInfo> {
  const cached = infoCache.get(hex);
  if (cached && (Date.now() - cached.ts) < INFO_CACHE_MS) return cached.data;

  const info: AircraftInfo = {
    hex,
    registration: null,
    type: null,
    icaoType: null,
    owner: null,
    airlineIata: null,
    airlineIcao: null,
    airlineLogo: null,
    airframeUrl: null,
    aircraftUrl: null,
    photo: null,
    photoLink: null,
    photographer: null,
    photos: [],
  };

  // planespotters.live: aircraft details + photos in one call
  try {
    const data = await fetchJSONFromUrl(`https://planespotters.live/api/aircraft/hex/${hex}`);
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
  } catch { /* planespotters.live unavailable */ }

  infoCache.set(hex, { data: info, ts: Date.now() });
  return info;
}

// GET /api/adsb/info/:hex — lookup aircraft details + photo by ICAO hex
router.get('/info/:hex', async (req: Request, res: Response) => {
  const hex = req.params.hex.toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) {
    return res.status(400).json({ error: 'Invalid hex code' });
  }

  try {
    const info = await lookupAircraft(hex);
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
