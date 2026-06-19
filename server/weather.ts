/**
 * NWS Weather API integration for Mesa, AZ.
 * Uses api.weather.gov (free, no API key, just requires User-Agent).
 *
 * Endpoints:
 * - GET /api/weather           → current conditions + forecast + alerts
 * - GET /api/weather/forecast  → 7-day forecast
 * - GET /api/weather/alerts    → active alerts for area
 */

import { Router, Request, Response } from 'express';
import https from 'https';

const router = Router();

// Mesa, AZ coordinates
const LAT = 33.4152;
const LON = -111.8315;
const GRID_OFFICE = 'PSR';
const GRID_X = 168;
const GRID_Y = 55;
const OBSERVATION_STATION = 'KIWA'; // Mesa Gateway Airport

const USER_AGENT = 'Airwave/2.0 (local media hub; contact: github.com/puppyonline/RAWR-SDR)';

// Cache
let cachedCurrent: any = null;
let cachedForecast: any = null;
let cachedAlerts: any = null;
let currentLastFetch = 0;
let forecastLastFetch = 0;
let alertsLastFetch = 0;

const CURRENT_CACHE_MS = 5 * 60 * 1000;   // 5 min (observations update every ~10 min)
const FORECAST_CACHE_MS = 30 * 60 * 1000;  // 30 min
const ALERTS_CACHE_MS = 2 * 60 * 1000;     // 2 min (alerts are time-critical)

function fetchNWS(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/geo+json' },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchNWS(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`NWS API ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from NWS')); }
      });
    }).on('error', reject);
  });
}

// ─── Current Conditions ────────────────────────────────────────────────────

interface CurrentConditions {
  temperature: number | null; // Fahrenheit
  feelsLike: number | null;
  humidity: number | null;
  windSpeed: number | null; // mph
  windDirection: string | null;
  description: string;
  icon: string | null;
  station: string;
  timestamp: string | null;
}

async function fetchCurrent(): Promise<CurrentConditions> {
  const now = Date.now();
  if (cachedCurrent && (now - currentLastFetch) < CURRENT_CACHE_MS) {
    return cachedCurrent;
  }

  try {
    const data = await fetchNWS(`https://api.weather.gov/stations/${OBSERVATION_STATION}/observations/latest`);
    const p = data?.properties || {};

    // Convert Celsius to Fahrenheit
    const tempC = p.temperature?.value;
    const tempF = tempC !== null && tempC !== undefined ? Math.round(tempC * 9/5 + 32) : null;

    const heatC = p.heatIndex?.value;
    const windChillC = p.windChill?.value;
    const feelsC = heatC ?? windChillC ?? tempC;
    const feelsF = feelsC !== null && feelsC !== undefined ? Math.round(feelsC * 9/5 + 32) : null;

    // Convert m/s to mph
    const windMs = p.windSpeed?.value;
    const windMph = windMs !== null && windMs !== undefined ? Math.round(windMs * 2.237) : null;

    const result: CurrentConditions = {
      temperature: tempF,
      feelsLike: feelsF,
      humidity: p.relativeHumidity?.value ? Math.round(p.relativeHumidity.value) : null,
      windSpeed: windMph,
      windDirection: p.windDirection?.value ? degreesToCardinal(p.windDirection.value) : null,
      description: p.textDescription || 'Unknown',
      icon: p.icon || null,
      station: OBSERVATION_STATION,
      timestamp: p.timestamp || null,
    };

    cachedCurrent = result;
    currentLastFetch = now;
    return result;
  } catch {
    return cachedCurrent || {
      temperature: null, feelsLike: null, humidity: null,
      windSpeed: null, windDirection: null, description: 'Unavailable',
      icon: null, station: OBSERVATION_STATION, timestamp: null,
    };
  }
}

function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ─── Forecast ──────────────────────────────────────────────────────────────

interface ForecastPeriod {
  name: string;
  temperature: number;
  unit: string;
  shortForecast: string;
  detailedForecast: string;
  icon: string | null;
  isDaytime: boolean;
  windSpeed: string;
  windDirection: string;
}

async function fetchForecast(): Promise<ForecastPeriod[]> {
  const now = Date.now();
  if (cachedForecast && (now - forecastLastFetch) < FORECAST_CACHE_MS) {
    return cachedForecast;
  }

  try {
    const data = await fetchNWS(`https://api.weather.gov/gridpoints/${GRID_OFFICE}/${GRID_X},${GRID_Y}/forecast`);
    const periods = (data?.properties?.periods || []).slice(0, 14).map((p: any) => ({
      name: p.name,
      temperature: p.temperature,
      unit: p.temperatureUnit,
      shortForecast: p.shortForecast,
      detailedForecast: p.detailedForecast,
      icon: p.icon || null,
      isDaytime: p.isDaytime,
      windSpeed: p.windSpeed,
      windDirection: p.windDirection,
    }));

    cachedForecast = periods;
    forecastLastFetch = now;
    return periods;
  } catch {
    return cachedForecast || [];
  }
}

// ─── Alerts ────────────────────────────────────────────────────────────────

interface WeatherAlert {
  event: string;
  severity: string;
  urgency: string;
  headline: string;
  description: string;
  instruction: string | null;
  areas: string;
  onset: string | null;
  expires: string | null;
}

async function fetchAlerts(): Promise<WeatherAlert[]> {
  const now = Date.now();
  if (cachedAlerts && (now - alertsLastFetch) < ALERTS_CACHE_MS) {
    return cachedAlerts;
  }

  try {
    const data = await fetchNWS(`https://api.weather.gov/alerts/active?point=${LAT},${LON}`);
    const alerts = (data?.features || []).map((f: any) => {
      const p = f.properties || {};
      return {
        event: p.event || 'Unknown',
        severity: p.severity || 'Unknown',
        urgency: p.urgency || 'Unknown',
        headline: p.headline || '',
        description: (p.description || '').slice(0, 500),
        instruction: p.instruction || null,
        areas: p.areaDesc || '',
        onset: p.onset || null,
        expires: p.expires || null,
      };
    });

    cachedAlerts = alerts;
    alertsLastFetch = now;
    return alerts;
  } catch {
    return cachedAlerts || [];
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

// GET /api/weather — everything in one call
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [current, forecast, alerts] = await Promise.all([
      fetchCurrent(),
      fetchForecast(),
      fetchAlerts(),
    ]);

    res.json({
      location: 'Mesa, AZ',
      current,
      forecast: forecast.slice(0, 7),
      alerts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/weather/forecast
router.get('/forecast', async (_req: Request, res: Response) => {
  try {
    const forecast = await fetchForecast();
    res.json(forecast);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/weather/alerts
router.get('/alerts', async (_req: Request, res: Response) => {
  try {
    const alerts = await fetchAlerts();
    res.json(alerts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

// Pre-fetch on startup
setTimeout(() => {
  fetchCurrent().then((c) => {
    if (c.temperature) console.log(`[Weather] Current: ${c.temperature}°F, ${c.description}`);
  }).catch(() => {});
  fetchForecast().catch(() => {});
  fetchAlerts().catch(() => {});
}, 2000);
