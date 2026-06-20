/**
 * ADS-B Aircraft Tracker using the R820T dongle (device 0).
 *
 * Uses rtl_adsb (part of rtl-sdr tools) to decode Mode S / ADS-B
 * transponder data at 1090 MHz. Runs concurrently with radio functions
 * on the E4000 (device 1).
 *
 * API:
 * - POST /api/adsb/start  → start tracking
 * - POST /api/adsb/stop   → stop tracking
 * - GET  /api/adsb/aircraft → current aircraft list
 */

import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';

const router = Router();

interface Aircraft {
  hex: string;
  flight: string;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  squawk: string;
  seen: number; // seconds since last message
  messages: number;
  lastUpdate: number; // timestamp
}

let adsbProcess: ChildProcess | null = null;
const aircraftMap = new Map<string, Aircraft>();
let lastCleanup = Date.now();

// Decode ADS-B messages from rtl_adsb output
// rtl_adsb outputs one hex message per line starting with *
function parseAdsbMessage(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('*') || !trimmed.endsWith(';')) return;

  const hex = trimmed.slice(1, -1); // Remove * and ;
  if (hex.length < 14) return; // Need at least short squitter

  // Extract ICAO address (bytes 1-3 of the message)
  const icao = hex.slice(2, 8).toUpperCase();
  if (!icao || icao === '000000') return;

  // Get or create aircraft entry
  let ac = aircraftMap.get(icao);
  if (!ac) {
    ac = {
      hex: icao,
      flight: '',
      lat: null,
      lon: null,
      altitude: null,
      speed: null,
      heading: null,
      squawk: '',
      seen: 0,
      messages: 0,
      lastUpdate: Date.now(),
    };
    aircraftMap.set(icao, ac);
  }

  ac.messages++;
  ac.lastUpdate = Date.now();
  ac.seen = 0;

  // Decode message type from downlink format (first 5 bits)
  const df = parseInt(hex.slice(0, 2), 16) >> 3;

  if (df === 17 || df === 18) {
    // Extended squitter (ADS-B)
    const typeCode = parseInt(hex.slice(8, 10), 16) >> 3;

    if (typeCode >= 1 && typeCode <= 4) {
      // Aircraft identification
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ     0123456789      ';
      const payload = hex.slice(8);
      let flight = '';
      // Extract 8 characters (6 bits each) from bits 40-87
      const bits = BigInt('0x' + payload);
      for (let i = 0; i < 8; i++) {
        const idx = Number((bits >> BigInt(42 - i * 6)) & BigInt(0x3F));
        if (idx < chars.length) flight += chars[idx];
      }
      ac.flight = flight.trim();
    } else if (typeCode >= 9 && typeCode <= 18) {
      // Airborne position (barometric altitude)
      const altBits = parseInt(hex.slice(10, 14), 16);
      const altCode = ((altBits & 0xFFF0) >> 1) | (altBits & 0x000F);
      // Simple altitude decode (not handling Q-bit properly for all cases)
      const qBit = (altBits >> 4) & 1;
      if (qBit) {
        const n = ((altBits >> 5) << 4) | (altBits & 0x0F);
        ac.altitude = n * 25 - 1000;
      }

      // CPR latitude/longitude decoding requires two messages (even/odd)
      // For simplicity, we'll rely on dump1090 if available, or just show ICAO + alt
    } else if (typeCode === 19) {
      // Airborne velocity
      const payload = hex.slice(8);
      const subtype = parseInt(payload.slice(2, 4), 16) & 0x07;
      if (subtype === 1 || subtype === 2) {
        // Ground speed
        const ewRaw = ((parseInt(payload.slice(4, 6), 16) & 0x03) << 8) | parseInt(payload.slice(6, 8), 16);
        const nsRaw = ((parseInt(payload.slice(8, 10), 16) & 0x7F) << 3) | (parseInt(payload.slice(10, 12), 16) >> 5);
        const ewVel = (parseInt(payload.slice(4, 5), 16) & 0x04) ? -(ewRaw - 1) : (ewRaw - 1);
        const nsVel = (parseInt(payload.slice(8, 9), 16) & 0x80) ? -(nsRaw - 1) : (nsRaw - 1);
        ac.speed = Math.round(Math.sqrt(ewVel * ewVel + nsVel * nsVel));
        ac.heading = Math.round((Math.atan2(ewVel, nsVel) * 180 / Math.PI + 360) % 360);
      }
    }
  } else if (df === 4 || df === 20) {
    // Altitude reply
    const altBits = parseInt(hex.slice(4, 8), 16) & 0x1FFF;
    const qBit = (altBits >> 4) & 1;
    if (qBit) {
      const n = ((altBits >> 5) << 4) | (altBits & 0x0F);
      ac.altitude = n * 25 - 1000;
    }
  } else if (df === 5 || df === 21) {
    // Squawk (identity reply)
    const id = parseInt(hex.slice(4, 8), 16) & 0x1FFF;
    // Decode Gillham code to squawk
    const a = ((id >> 9) & 0x07);
    const b = ((id >> 6) & 0x07);
    const c = ((id >> 3) & 0x07);
    const d = (id & 0x07);
    ac.squawk = `${a}${b}${c}${d}`;
  }
}

// Clean up stale aircraft (not seen in 60 seconds)
function cleanupAircraft() {
  const now = Date.now();
  if (now - lastCleanup < 5000) return; // Only every 5s
  lastCleanup = now;

  for (const [hex, ac] of aircraftMap) {
    ac.seen = Math.round((now - ac.lastUpdate) / 1000);
    if (ac.seen > 60) {
      aircraftMap.delete(hex);
    }
  }
}

// POST /api/adsb/start
router.post('/start', (_req: Request, res: Response) => {
  if (adsbProcess) {
    return res.json({ status: 'already running', aircraft: aircraftMap.size });
  }

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'rtl_adsb.exe' : 'rtl_adsb';

  // Device 0 = R820T Mini (dedicated ADS-B receiver)
  // Gain 42 dB for maximum sensitivity at 1090 MHz
  adsbProcess = spawn(cmd, ['-d', '0', '-g', '42'], { stdio: ['pipe', 'pipe', 'pipe'] });

  adsbProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) parseAdsbMessage(line);
    }
    cleanupAircraft();
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
    console.log(`[ADS-B] Process exited (code ${code})`);
    adsbProcess = null;
  });

  console.log('[ADS-B] Started tracking (R820T, device 0, 1090 MHz)');
  res.json({ status: 'started' });
});

// POST /api/adsb/stop
router.post('/stop', (_req: Request, res: Response) => {
  if (adsbProcess) {
    adsbProcess.kill('SIGTERM');
    adsbProcess = null;
    aircraftMap.clear();
    console.log('[ADS-B] Stopped tracking');
  }
  res.json({ status: 'stopped' });
});

// GET /api/adsb/aircraft
router.get('/aircraft', (_req: Request, res: Response) => {
  cleanupAircraft();
  const list = Array.from(aircraftMap.values())
    .filter((ac) => ac.messages > 1) // Need at least 2 messages to be real
    .sort((a, b) => a.seen - b.seen); // Most recent first
  res.json({
    count: list.length,
    aircraft: list,
    tracking: adsbProcess !== null,
  });
});

export default router;
