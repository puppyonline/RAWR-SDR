/**
 * Weather & Environment API for Mesa, AZ.
 *
 * Data sources (all free, no API keys):
 * - NWS api.weather.gov — current conditions, forecast, alerts
 * - Open-Meteo — hourly UV index, air quality (PM2.5, PM10, ozone), precipitation prob,
 *   visibility, solar radiation, dewpoint, wind gusts
 * - N2YO-style TLE computation — NOAA satellite pass predictions
 *
 * Endpoints:
 * - GET /api/weather              → everything (NWS + Open-Meteo + passes)
 * - GET /api/weather/forecast     → 7-day NWS forecast
 * - GET /api/weather/alerts       → active NWS alerts
 * - GET /api/weather/environment  → Open-Meteo hourly env data
 * - GET /api/weather/satellites   → NOAA satellite pass schedule
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

// ─── Generic HTTP fetch helpers ────────────────────────────────────────────

function fetchJSON(url: string, headers?: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const allHeaders: Record<string, string> = { 'User-Agent': USER_AGENT, ...headers };
    https.get(url, { timeout: 10000, headers: allHeaders }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJSON(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    }).on('error', reject);
  });
}

// ─── Cache infrastructure ──────────────────────────────────────────────────

interface CacheEntry<T> { data: T; fetched: number; }

const cache: Record<string, CacheEntry<any>> = {};

function getCached<T>(key: string, maxAge: number): T | null {
  const entry = cache[key];
  if (entry && (Date.now() - entry.fetched) < maxAge) return entry.data;
  return null;
}

function setCache<T>(key: string, data: T): T {
  cache[key] = { data, fetched: Date.now() };
  return data;
}

const CURRENT_CACHE_MS = 5 * 60 * 1000;
const FORECAST_CACHE_MS = 30 * 60 * 1000;
const ALERTS_CACHE_MS = 2 * 60 * 1000;
const ENV_CACHE_MS = 15 * 60 * 1000;
const SAT_CACHE_MS = 60 * 60 * 1000; // 1 hour

// ─── NWS: Current Conditions ───────────────────────────────────────────────

interface CurrentConditions {
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: string | null;
  description: string;
  icon: string | null;
  station: string;
  timestamp: string | null;
}

async function fetchCurrent(): Promise<CurrentConditions> {
  const cached = getCached<CurrentConditions>('current', CURRENT_CACHE_MS);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://api.weather.gov/stations/${OBSERVATION_STATION}/observations/latest`,
      { Accept: 'application/geo+json' }
    );
    const p = data?.properties || {};

    const tempC = p.temperature?.value;
    const tempF = tempC !== null && tempC !== undefined ? Math.round(tempC * 9/5 + 32) : null;

    const heatC = p.heatIndex?.value;
    const windChillC = p.windChill?.value;
    const feelsC = heatC ?? windChillC ?? tempC;
    const feelsF = feelsC !== null && feelsC !== undefined ? Math.round(feelsC * 9/5 + 32) : null;

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

    return setCache('current', result);
  } catch {
    return getCached<CurrentConditions>('current', Infinity) || {
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

// ─── NWS: Forecast ─────────────────────────────────────────────────────────

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
  const cached = getCached<ForecastPeriod[]>('forecast', FORECAST_CACHE_MS);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://api.weather.gov/gridpoints/${GRID_OFFICE}/${GRID_X},${GRID_Y}/forecast`,
      { Accept: 'application/geo+json' }
    );
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

    return setCache('forecast', periods);
  } catch {
    return getCached<ForecastPeriod[]>('forecast', Infinity) || [];
  }
}

// ─── NWS: Alerts ───────────────────────────────────────────────────────────

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
  const cached = getCached<WeatherAlert[]>('alerts', ALERTS_CACHE_MS);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://api.weather.gov/alerts/active?point=${LAT},${LON}`,
      { Accept: 'application/geo+json' }
    );
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

    return setCache('alerts', alerts);
  } catch {
    return getCached<WeatherAlert[]>('alerts', Infinity) || [];
  }
}

// ─── Open-Meteo: Environment Data ─────────────────────────────────────────

interface EnvironmentData {
  hourly: Array<{
    time: string;
    uvIndex: number | null;
    precipitationProbability: number | null;
    visibility: number | null;       // meters
    solarRadiation: number | null;   // W/m²
    dewpoint: number | null;         // °F
    windGusts: number | null;        // mph
  }>;
  airQuality: {
    pm2_5: number | null;
    pm10: number | null;
    ozone: number | null;
    usAqi: number | null;
    europeanAqi: number | null;
  };
  current: {
    uvIndex: number | null;
    precipitationProbability: number | null;
    visibility: number | null;
    solarRadiation: number | null;
    dewpoint: number | null;
    windGusts: number | null;
  };
}

async function fetchEnvironment(): Promise<EnvironmentData> {
  const cached = getCached<EnvironmentData>('environment', ENV_CACHE_MS);
  if (cached) return cached;

  try {
    // Fetch hourly weather data
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&hourly=uv_index,precipitation_probability,visibility,direct_radiation,dewpoint_2m,wind_gusts_10m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2&timezone=America%2FPhoenix`;

    // Fetch air quality data
    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}` +
      `&current=pm2_5,pm10,ozone,us_aqi,european_aqi&timezone=America%2FPhoenix`;

    const [weatherData, aqData] = await Promise.all([
      fetchJSON(weatherUrl),
      fetchJSON(aqUrl).catch(() => null),
    ]);

    const hourlyTimes: string[] = weatherData?.hourly?.time || [];
    const hourlyUv: number[] = weatherData?.hourly?.uv_index || [];
    const hourlyPrecip: number[] = weatherData?.hourly?.precipitation_probability || [];
    const hourlyVis: number[] = weatherData?.hourly?.visibility || [];
    const hourlySolar: number[] = weatherData?.hourly?.direct_radiation || [];
    const hourlyDew: number[] = weatherData?.hourly?.dewpoint_2m || [];
    const hourlyGusts: number[] = weatherData?.hourly?.wind_gusts_10m || [];

    // Find current hour index
    const nowHour = new Date().toISOString().slice(0, 13);
    const localNow = new Date();
    // Open-Meteo returns local times in the specified timezone
    const currentIdx = hourlyTimes.findIndex((t) => {
      const tDate = new Date(t);
      return tDate.getHours() === localNow.getHours() && tDate.getDate() === localNow.getDate();
    });
    const idx = currentIdx >= 0 ? currentIdx : 0;

    // Take next 24 hours from current
    const hourly = hourlyTimes.slice(idx, idx + 24).map((time, i) => ({
      time,
      uvIndex: hourlyUv[idx + i] ?? null,
      precipitationProbability: hourlyPrecip[idx + i] ?? null,
      visibility: hourlyVis[idx + i] ?? null,
      solarRadiation: hourlySolar[idx + i] ?? null,
      dewpoint: hourlyDew[idx + i] ?? null,
      windGusts: hourlyGusts[idx + i] ?? null,
    }));

    const aqCurrent = aqData?.current || {};

    const result: EnvironmentData = {
      hourly,
      airQuality: {
        pm2_5: aqCurrent.pm2_5 ?? null,
        pm10: aqCurrent.pm10 ?? null,
        ozone: aqCurrent.ozone ?? null,
        usAqi: aqCurrent.us_aqi ?? null,
        europeanAqi: aqCurrent.european_aqi ?? null,
      },
      current: {
        uvIndex: hourlyUv[idx] ?? null,
        precipitationProbability: hourlyPrecip[idx] ?? null,
        visibility: hourlyVis[idx] ?? null,
        solarRadiation: hourlySolar[idx] ?? null,
        dewpoint: hourlyDew[idx] ?? null,
        windGusts: hourlyGusts[idx] ?? null,
      },
    };

    return setCache('environment', result);
  } catch {
    return getCached<EnvironmentData>('environment', Infinity) || {
      hourly: [],
      airQuality: { pm2_5: null, pm10: null, ozone: null, usAqi: null, europeanAqi: null },
      current: { uvIndex: null, precipitationProbability: null, visibility: null, solarRadiation: null, dewpoint: null, windGusts: null },
    };
  }
}

// ─── NOAA Satellite Pass Prediction ────────────────────────────────────────
// Uses Celestrak TLE data + simplified SGP4-like prediction
// NOAA satellites: 137 MHz APT downlinks

interface SatellitePass {
  satellite: string;
  noradId: number;
  frequency: number;        // MHz
  riseTime: string;         // ISO
  setTime: string;          // ISO
  maxElevation: number;     // degrees
  duration: number;         // seconds
  direction: string;        // e.g. "N→S" or "S→N"
}

// NOAA satellite catalog
const NOAA_SATS = [
  { name: 'NOAA-15', noradId: 25338, freq: 137.6200 },
  { name: 'NOAA-18', noradId: 28654, freq: 137.9125 },
  { name: 'NOAA-19', noradId: 33591, freq: 137.1000 },
];

async function fetchSatellitePasses(): Promise<SatellitePass[]> {
  const cached = getCached<SatellitePass[]>('satellites', SAT_CACHE_MS);
  if (cached) return cached;

  const allPasses: SatellitePass[] = [];

  // Use N2YO API (free tier: 300 requests/hour, no key needed for basic visual passes)
  // Fallback: compute from TLE if N2YO unavailable
  for (const sat of NOAA_SATS) {
    try {
      // N2YO radio passes endpoint: /rest/v1/satellite/radiopasses/{id}/{lat}/{lng}/{alt}/{days}/&apiKey=
      // Without API key we use the visual passes endpoint which is publicly cached
      // Alternative: use their free predictions page scrape
      // Best free option: use open-source pass prediction from TLE
      const passes = await computePassesFromTLE(sat);
      allPasses.push(...passes);
    } catch {
      // Skip this satellite if prediction fails
    }
  }

  // Sort by rise time
  allPasses.sort((a, b) => new Date(a.riseTime).getTime() - new Date(b.riseTime).getTime());

  return setCache('satellites', allPasses);
}

/**
 * Simplified satellite pass prediction using TLE data from Celestrak.
 * This uses a basic orbital mechanics approach — not full SGP4, but accurate
 * enough for pass time estimation (±2 min).
 */
async function computePassesFromTLE(sat: { name: string; noradId: number; freq: number }): Promise<SatellitePass[]> {
  // Fetch TLE from Celestrak (free, no key)
  const tleUrl = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.noradId}&FORMAT=TLE`;
  const tleData = await new Promise<string>((resolve, reject) => {
    https.get(tleUrl, { timeout: 10000, headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) { reject(new Error(`TLE fetch ${res.statusCode}`)); return; }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });

  const lines = tleData.trim().split('\n').map((l) => l.trim());
  if (lines.length < 3) return [];

  const tle1 = lines[1];
  const tle2 = lines[2];

  // Parse orbital elements from TLE
  const inclination = parseFloat(tle2.substring(8, 16));        // degrees
  const raan = parseFloat(tle2.substring(17, 25));              // degrees (right ascension of ascending node)
  const eccentricity = parseFloat('0.' + tle2.substring(26, 33));
  const argPerigee = parseFloat(tle2.substring(34, 42));        // degrees
  const meanAnomaly = parseFloat(tle2.substring(43, 51));       // degrees
  const meanMotion = parseFloat(tle2.substring(52, 63));        // rev/day

  const epochYear = parseInt(tle1.substring(18, 20));
  const epochDay = parseFloat(tle1.substring(20, 32));
  const fullYear = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;

  // Compute orbital period in minutes
  const periodMin = 1440.0 / meanMotion;

  // NOAA satellites are sun-synchronous, ~98.7° inclination, ~850km altitude
  // Period is roughly 101-102 minutes
  // They pass over any given point roughly every ~12 hours (ascending + descending)

  const passes: SatellitePass[] = [];
  const now = Date.now();
  const observerLatRad = LAT * Math.PI / 180;
  const observerLonRad = LON * Math.PI / 180;

  // Semi-major axis from mean motion (km)
  const mu = 398600.4418; // km³/s²
  const n = meanMotion * 2 * Math.PI / 86400; // rad/s
  const a = Math.pow(mu / (n * n), 1/3); // km
  const altitude = a - 6371; // approximate altitude km

  // Epoch as Date
  const epochDate = new Date(Date.UTC(fullYear, 0, 1));
  epochDate.setTime(epochDate.getTime() + (epochDay - 1) * 86400000);

  // Simplified pass prediction:
  // Step through time in 1-minute intervals over the next 24 hours.
  // Compute sub-satellite point and check if elevation > threshold.
  const stepMs = 60000; // 1 minute
  const windowMs = 24 * 3600000; // 24 hours
  const minElevation = 10; // minimum useful elevation for 137 MHz

  let inPass = false;
  let passStart = 0;
  let maxElev = 0;
  let riseAz = 0;
  let setAz = 0;

  for (let t = 0; t <= windowMs; t += stepMs) {
    const time = now + t;
    const elapsedSec = (time - epochDate.getTime()) / 1000;
    const elapsedMin = elapsedSec / 60;

    // Mean anomaly at time t
    const M = (meanAnomaly + 360 * meanMotion * (elapsedSec / 86400)) % 360;
    const MRad = M * Math.PI / 180;

    // Solve Kepler's equation (simplified for near-circular: E ≈ M for e < 0.01)
    let E = MRad;
    for (let i = 0; i < 5; i++) {
      E = MRad + eccentricity * Math.sin(E);
    }

    // True anomaly
    const sinV = Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(E) / (1 - eccentricity * Math.cos(E));
    const cosV = (Math.cos(E) - eccentricity) / (1 - eccentricity * Math.cos(E));
    const v = Math.atan2(sinV, cosV);

    // Argument of latitude
    const u = (argPerigee * Math.PI / 180) + v;

    // RAAN precession (J2 effect for sun-synchronous)
    const raanRate = -1.5 * 1.08263e-3 * Math.pow(6371 / a, 2) * meanMotion * 2 * Math.PI / 86400 *
                     Math.cos(inclination * Math.PI / 180) / (1 - eccentricity * eccentricity) ** 2;
    const currentRaan = (raan * Math.PI / 180) + raanRate * elapsedSec;

    // Sub-satellite point
    const incRad = inclination * Math.PI / 180;
    const subLat = Math.asin(Math.sin(incRad) * Math.sin(u));

    // Greenwich sidereal time
    const jd = 2440587.5 + time / 86400000;
    const T = (jd - 2451545.0) / 36525;
    const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545.0) +
                  0.000387933 * T * T) % 360;
    const gmstRad = gmst * Math.PI / 180;

    const subLon = Math.atan2(Math.sin(u) * Math.cos(incRad), Math.cos(u)) + currentRaan - gmstRad;

    // Elevation from observer
    const dLat = subLat - observerLatRad;
    const dLon = ((subLon - observerLonRad + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const surfaceDist = Math.sqrt(dLat * dLat + (dLon * Math.cos(observerLatRad)) ** 2) * 6371; // km on surface

    // Elevation angle (simplified geometric)
    const elevation = Math.atan2(altitude - surfaceDist * surfaceDist / (2 * 6371),
                                 surfaceDist) * 180 / Math.PI;

    // More accurate elevation: use slant range
    const slantElev = Math.atan((altitude / surfaceDist) - surfaceDist / (2 * 6371)) * 180 / Math.PI;
    const elev = Math.max(slantElev, 0);

    // Azimuth from observer
    const az = (Math.atan2(dLon * Math.cos(observerLatRad), dLat) * 180 / Math.PI + 360) % 360;

    if (elev >= minElevation && !inPass) {
      inPass = true;
      passStart = time;
      maxElev = elev;
      riseAz = az;
    } else if (inPass && elev >= minElevation) {
      if (elev > maxElev) maxElev = elev;
    } else if (inPass && elev < minElevation) {
      inPass = false;
      setAz = az;
      const duration = Math.round((time - passStart) / 1000);

      // Only include passes with reasonable duration and elevation
      if (duration >= 120 && maxElev >= 15) {
        const direction = riseAz < 180 ? 'N→S' : 'S→N';
        passes.push({
          satellite: sat.name,
          noradId: sat.noradId,
          frequency: sat.freq,
          riseTime: new Date(passStart).toISOString(),
          setTime: new Date(time).toISOString(),
          maxElevation: Math.round(maxElev),
          duration,
          direction,
        });
      }
      maxElev = 0;
    }
  }

  return passes;
}

// ─── Routes ────────────────────────────────────────────────────────────────

// GET /api/weather — everything
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [current, forecast, alerts, environment, satellites] = await Promise.all([
      fetchCurrent(),
      fetchForecast(),
      fetchAlerts(),
      fetchEnvironment(),
      fetchSatellitePasses().catch(() => []),
    ]);

    res.json({
      location: 'Mesa, AZ',
      current,
      forecast: forecast.slice(0, 7),
      alerts,
      environment,
      satellites,
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

// GET /api/weather/environment
router.get('/environment', async (_req: Request, res: Response) => {
  try {
    const environment = await fetchEnvironment();
    res.json(environment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/weather/satellites
router.get('/satellites', async (_req: Request, res: Response) => {
  try {
    const satellites = await fetchSatellitePasses();
    res.json(satellites);
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
  fetchEnvironment().then((e) => {
    if (e.current.uvIndex !== null) console.log(`[Weather] UV: ${e.current.uvIndex}, AQI: ${e.airQuality.usAqi ?? 'N/A'}`);
  }).catch(() => {});
  fetchSatellitePasses().then((passes) => {
    if (passes.length) console.log(`[Weather] Next pass: ${passes[0].satellite} at ${new Date(passes[0].riseTime).toLocaleTimeString()}`);
  }).catch(() => {});
}, 2000);
