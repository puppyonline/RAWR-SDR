/**
 * Recommendations endpoint for the Airwave dashboard.
 * Surfaces popular FM stations and currently-airing TV shows
 * to create a "what's on now" central hub experience.
 */

import { Router, Request, Response } from 'express';
import http from 'http';
import https from 'https';

const router = Router();

// ─── Popular FM stations (curated for Phoenix/Mesa) ────────────────────────

export interface FMStation {
  freq: number;
  callsign: string;
  format: string;
  slogan?: string;
  city: string;
  popular: boolean;
}

const popularFMStations: FMStation[] = [
  { freq: 91.5, callsign: 'KJZZ', format: 'NPR / Public Radio', slogan: "Arizona's NPR Station", city: 'Phoenix, AZ', popular: true },
  { freq: 92.3, callsign: 'KTAR', format: 'News/Talk', slogan: 'Arizona News & Talk', city: 'Phoenix, AZ', popular: true },
  { freq: 93.3, callsign: 'KDKB', format: 'Alternative Rock', slogan: 'Arizona Alternative', city: 'Mesa, AZ', popular: true },
  { freq: 94.5, callsign: 'KOOL', format: 'Classic Hits', slogan: "Arizona's Classic Hits", city: 'Phoenix, AZ', popular: true },
  { freq: 97.9, callsign: 'KUPD', format: 'Rock', slogan: 'Real Rock Radio', city: 'Tempe, AZ', popular: true },
  { freq: 98.7, callsign: 'KMVP', format: 'Sports', slogan: 'Arizona Sports', city: 'Phoenix, AZ', popular: true },
  { freq: 99.9, callsign: 'KESZ', format: 'Adult Contemporary', slogan: 'More Music, Less Talk', city: 'Phoenix, AZ', popular: true },
  { freq: 100.7, callsign: 'KNIX', format: 'Country', slogan: "Arizona's Country", city: 'Phoenix, AZ', popular: true },
  { freq: 104.7, callsign: 'KFYI', format: 'News/Talk', slogan: 'News Talk 104.7', city: 'Phoenix, AZ', popular: true },
  { freq: 89.5, callsign: 'KBAQ', format: 'Classical', slogan: 'Classical Music for Arizona', city: 'Phoenix, AZ', popular: true },
  { freq: 95.5, callsign: 'KYOT', format: 'Adult Hits', slogan: 'The Coyote', city: 'Phoenix, AZ', popular: false },
  { freq: 96.9, callsign: 'KMXP', format: 'Hot AC', slogan: 'Mix 96.9', city: 'Phoenix, AZ', popular: false },
  { freq: 100.3, callsign: 'KSLX', format: 'Classic Rock', slogan: 'Arizona Classic Rock', city: 'Scottsdale, AZ', popular: false },
  { freq: 103.9, callsign: 'KEDJ', format: 'Rhythmic/Top 40', slogan: 'The Edge', city: 'Sun City, AZ', popular: false },
  { freq: 107.9, callsign: 'KMLE', format: 'Country', slogan: 'Country Music for Arizona', city: 'Chandler, AZ', popular: false },
];

// ─── TV "Now Airing" from HDHomeRun guide ──────────────────────────────────

interface TVNowAiring {
  channel: string;
  channelName: string;
  network?: string;
  title: string;
  episodeTitle?: string;
  synopsis?: string;
  startTime: number;
  endTime: number;
  timeRemaining: number; // minutes
  progress: number; // 0-100 percent through the show
}

let cachedGuide: any[] = [];
let guideLastFetch = 0;
const GUIDE_CACHE_MS = 10 * 60 * 1000; // 10 min

// Phoenix OTA channel network mapping
const channelNetworks: Record<string, string> = {
  '3': 'KTVK',
  '5': 'CBS',
  '7': 'CW',
  '8': 'PBS',
  '10': 'NBC',
  '12': 'NBC',
  '15': 'ABC',
  '33': 'FOX',
  '45': 'Univision',
  '61': 'ION',
};

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 8000 }, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

async function fetchGuideData(): Promise<any[]> {
  const now = Date.now();
  if (cachedGuide.length > 0 && (now - guideLastFetch) < GUIDE_CACHE_MS) {
    return cachedGuide;
  }

  try {
    // First get device auth from HDHR
    let device: any = null;
    try {
      device = await fetchJSON('http://hdhomerun.local/discover.json');
    } catch {
      // Try cloud discovery
      try {
        const devices = await fetchJSON('https://ipv4-api.hdhomerun.com/discover');
        if (Array.isArray(devices) && devices.length > 0) device = devices[0];
      } catch { /* no device */ }
    }

    if (!device?.DeviceAuth) return cachedGuide;

    const guide = await fetchJSON(
      `https://api.hdhomerun.com/api/guide?DeviceAuth=${encodeURIComponent(device.DeviceAuth)}`
    );
    cachedGuide = Array.isArray(guide) ? guide : [];
    guideLastFetch = now;
    return cachedGuide;
  } catch {
    return cachedGuide;
  }
}

function getNowAiring(guide: any[]): TVNowAiring[] {
  const now = Math.floor(Date.now() / 1000);
  const results: TVNowAiring[] = [];

  for (const ch of guide) {
    const guideNumber = ch.GuideNumber;
    // Skip ATSC 3.0 channels (>= 100)
    if (parseFloat(guideNumber) >= 100) continue;

    const entries = ch.Guide || [];
    const current = entries.find((e: any) => e.StartTime <= now && e.EndTime > now);
    if (!current) continue;

    const totalDuration = current.EndTime - current.StartTime;
    const elapsed = now - current.StartTime;
    const remaining = current.EndTime - now;

    results.push({
      channel: guideNumber,
      channelName: ch.GuideName || guideNumber,
      network: channelNetworks[guideNumber.split('.')[0]] || undefined,
      title: current.Title || 'Unknown',
      episodeTitle: current.EpisodeTitle || undefined,
      synopsis: current.Synopsis || undefined,
      startTime: current.StartTime,
      endTime: current.EndTime,
      timeRemaining: Math.ceil(remaining / 60),
      progress: Math.min(100, Math.round((elapsed / totalDuration) * 100)),
    });
  }

  // Sort: major networks first, then by channel number
  const majorNetworks = ['ABC', 'NBC', 'CBS', 'FOX', 'PBS', 'CW'];
  results.sort((a, b) => {
    const aIdx = majorNetworks.indexOf(a.network || '');
    const bIdx = majorNetworks.indexOf(b.network || '');
    if (aIdx !== -1 && bIdx === -1) return -1;
    if (aIdx === -1 && bIdx !== -1) return 1;
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return parseFloat(a.channel) - parseFloat(b.channel);
  });

  return results;
}

// ─── API Routes ────────────────────────────────────────────────────────────

// GET /api/recommendations
// Returns curated FM stations + currently airing TV shows
router.get('/', async (_req: Request, res: Response) => {
  try {
    const guide = await fetchGuideData();
    const nowAiring = getNowAiring(guide);

    res.json({
      radio: {
        featured: popularFMStations.filter((s) => s.popular),
        all: popularFMStations,
      },
      tv: {
        nowAiring: nowAiring.slice(0, 12), // top 12 channels
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recommendations/tv/now
// Just the TV "now airing" data
router.get('/tv/now', async (_req: Request, res: Response) => {
  try {
    const guide = await fetchGuideData();
    const nowAiring = getNowAiring(guide);
    res.json(nowAiring);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recommendations/radio
// Just the radio station recommendations
router.get('/radio', (_req: Request, res: Response) => {
  res.json({
    featured: popularFMStations.filter((s) => s.popular),
    all: popularFMStations,
  });
});

export default router;
