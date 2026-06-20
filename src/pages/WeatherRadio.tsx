import { useState, useEffect, useRef } from 'react';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

// ─── Types ─────────────────────────────────────────────────────────────────

interface EnvironmentHourly {
  time: string;
  uvIndex: number | null;
  precipitationProbability: number | null;
  visibility: number | null;
  solarRadiation: number | null;
  dewpoint: number | null;
  windGusts: number | null;
}

interface AirQuality {
  pm2_5: number | null;
  pm10: number | null;
  ozone: number | null;
  usAqi: number | null;
  europeanAqi: number | null;
}

interface SatellitePass {
  satellite: string;
  noradId: number;
  frequency: number;
  riseTime: string;
  setTime: string;
  maxElevation: number;
  duration: number;
  direction: string;
}

interface WeatherData {
  location: string;
  current: {
    temperature: number | null;
    feelsLike: number | null;
    humidity: number | null;
    windSpeed: number | null;
    windDirection: string | null;
    description: string;
    icon: string | null;
    station: string;
    timestamp: string | null;
  };
  forecast: Array<{
    name: string;
    temperature: number;
    unit: string;
    shortForecast: string;
    detailedForecast: string;
    isDaytime: boolean;
    windSpeed: string;
    windDirection: string;
  }>;
  alerts: Array<{
    event: string;
    severity: string;
    urgency: string;
    headline: string;
    description: string;
    instruction: string | null;
    areas: string;
    onset: string | null;
    expires: string | null;
  }>;
  environment: {
    hourly: EnvironmentHourly[];
    airQuality: AirQuality;
    current: {
      uvIndex: number | null;
      precipitationProbability: number | null;
      visibility: number | null;
      solarRadiation: number | null;
      dewpoint: number | null;
      windGusts: number | null;
    };
  };
  satellites: SatellitePass[];
}

// NOAA Weather Radio frequencies receivable from Mesa, AZ
const stations = [
  { freq: 162.550, label: 'WXL-58', desc: 'Phoenix (primary)', area: 'Maricopa County', power: '300W' },
  { freq: 162.500, label: 'KEC-81', desc: 'Globe / Signal Peak (weak)', area: 'Gila County', power: '300W' },
];

// ─── Helper: UV severity ───────────────────────────────────────────────────

function uvLevel(uv: number): { label: string; color: string } {
  if (uv <= 2) return { label: 'Low', color: 'text-green-400' };
  if (uv <= 5) return { label: 'Moderate', color: 'text-yellow-400' };
  if (uv <= 7) return { label: 'High', color: 'text-orange-400' };
  if (uv <= 10) return { label: 'Very High', color: 'text-red-400' };
  return { label: 'Extreme', color: 'text-purple-400' };
}

function aqiLevel(aqi: number): { label: string; color: string } {
  if (aqi <= 50) return { label: 'Good', color: 'text-green-400' };
  if (aqi <= 100) return { label: 'Moderate', color: 'text-yellow-400' };
  if (aqi <= 150) return { label: 'Unhealthy (Sensitive)', color: 'text-orange-400' };
  if (aqi <= 200) return { label: 'Unhealthy', color: 'text-red-400' };
  if (aqi <= 300) return { label: 'Very Unhealthy', color: 'text-purple-400' };
  return { label: 'Hazardous', color: 'text-rose-500' };
}

function formatVisibility(meters: number): string {
  const miles = meters / 1609.34;
  if (miles >= 10) return `${Math.round(miles)} mi`;
  return `${miles.toFixed(1)} mi`;
}

// ─── Active Tab Type ───────────────────────────────────────────────────────

type Tab = 'overview' | 'environment' | 'satellites' | 'radar' | 'radio';

function WeatherRadio() {
  const [tab, setTab] = useState<Tab>('overview');
  const [frequency, setFrequency] = useState(162.550);
  const [volume, setVolume] = useState(80);
  const [power, setPower] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const audio = useAudioStream();
  const tuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTune = useRef(false);

  // Fetch weather data
  useEffect(() => {
    fetch('/api/weather')
      .then((r) => r.ok ? r.json() : null)
      .then(setWeather)
      .catch(() => {});

    const interval = setInterval(() => {
      fetch('/api/weather')
        .then((r) => r.ok ? r.json() : null)
        .then(setWeather)
        .catch(() => {});
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => { audio.setVolume(volume); }, [volume, audio.setVolume]);

  useEffect(() => {
    if (power && !initialTune.current) {
      initialTune.current = true;
      audio.tune(frequency, 'noaa');
    }
    if (!power) initialTune.current = false;
  }, [power]);

  useEffect(() => {
    if (!power) return;
    if (tuneTimer.current) clearTimeout(tuneTimer.current);
    tuneTimer.current = setTimeout(() => {
      audio.tune(frequency, 'noaa');
    }, 400);
    return () => { if (tuneTimer.current) clearTimeout(tuneTimer.current); };
  }, [frequency]);

  const togglePower = async () => {
    if (power) {
      setPower(false);
      await audio.stop();
    } else {
      setPower(true);
    }
  };

  const currentStation = stations.find((s) => s.freq === frequency);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'environment', label: 'Environment' },
    { id: 'satellites', label: 'Satellites' },
    { id: 'radar', label: 'Radar' },
    { id: 'radio', label: 'NOAA Radio' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-title">Weather &amp; Environment</h2>
            <p className="section-subtitle mt-0.5">Mesa, AZ 85202 &middot; NWS + Open-Meteo + NOAA Satellites</p>
          </div>
          {weather?.current.timestamp && (
            <span className="text-2xs text-faint">
              Updated {new Date(weather.current.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'bg-brand/10 text-brand-bright border border-brand/20'
                  : 'text-muted hover:text-secondary hover:bg-hover'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active alerts — always visible */}
      {weather && weather.alerts.length > 0 && (
        <div className="space-y-2">
          {weather.alerts.map((alert, i) => (
            <div key={i} className={`card p-4 border-l-4 ${
              alert.severity === 'Extreme' ? 'border-l-danger bg-danger/5' :
              alert.severity === 'Severe' ? 'border-l-warn bg-warn/5' :
              'border-l-brand bg-brand/5'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-primary">{alert.event}</p>
                  <p className="text-xs text-secondary mt-0.5">{alert.headline}</p>
                </div>
                <span className={`badge text-2xs ${
                  alert.severity === 'Extreme' ? 'bg-danger/10 text-danger border border-danger/20' :
                  alert.severity === 'Severe' ? 'bg-warn/10 text-warn border border-warn/20' :
                  'badge-brand'
                }`}>{alert.severity}</span>
              </div>
              {alert.description && (
                <p className="text-xs text-muted mt-2 line-clamp-3 leading-relaxed">{alert.description}</p>
              )}
              {alert.instruction && (
                <p className="text-xs text-secondary mt-2 font-medium">{alert.instruction.slice(0, 200)}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span className="text-2xs text-faint">{alert.areas}</span>
                {alert.expires && (
                  <span className="text-2xs text-faint">
                    Expires: {new Date(alert.expires).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ OVERVIEW TAB ═══ */}
      {tab === 'overview' && weather && (
        <div className="space-y-4">
          {/* Current + Environment summary row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Current conditions */}
            <div className="card p-5">
              <span className="label">Current Conditions</span>
              <div className="mt-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-4xl font-bold text-primary font-mono">
                      {weather.current.temperature !== null ? `${weather.current.temperature}°` : '--°'}
                    </p>
                    <p className="text-sm text-secondary mt-1">{weather.current.description}</p>
                    {weather.current.feelsLike !== null && weather.current.feelsLike !== weather.current.temperature && (
                      <p className="text-xs text-muted mt-0.5">Feels like {weather.current.feelsLike}°F</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">{weather.location}</p>
                    <p className="text-2xs text-faint mt-0.5">Stn: {weather.current.station}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-t-[var(--color-border)]">
                  <div>
                    <p className="text-2xs text-faint">Humidity</p>
                    <p className="text-sm font-medium text-secondary">{weather.current.humidity ?? '--'}%</p>
                  </div>
                  <div>
                    <p className="text-2xs text-faint">Wind</p>
                    <p className="text-sm font-medium text-secondary">
                      {weather.current.windSpeed ?? '--'} mph
                      {weather.current.windDirection && <span className="text-faint"> {weather.current.windDirection}</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-faint">Dewpoint</p>
                    <p className="text-sm font-medium text-secondary">
                      {weather.environment?.current.dewpoint !== null ? `${Math.round(weather.environment.current.dewpoint)}°` : '--'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Environment snapshot */}
            <div className="card p-5">
              <span className="label">Environment</span>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="card-inner p-3">
                  <p className="text-2xs text-faint">UV Index</p>
                  <p className={`text-lg font-bold font-mono ${weather.environment?.current.uvIndex !== null ? uvLevel(weather.environment.current.uvIndex).color : 'text-muted'}`}>
                    {weather.environment?.current.uvIndex !== null ? weather.environment.current.uvIndex.toFixed(1) : '--'}
                  </p>
                  {weather.environment?.current.uvIndex !== null && (
                    <p className={`text-2xs ${uvLevel(weather.environment.current.uvIndex).color}`}>
                      {uvLevel(weather.environment.current.uvIndex).label}
                    </p>
                  )}
                </div>
                <div className="card-inner p-3">
                  <p className="text-2xs text-faint">Air Quality</p>
                  <p className={`text-lg font-bold font-mono ${weather.environment?.airQuality.usAqi !== null ? aqiLevel(weather.environment.airQuality.usAqi).color : 'text-muted'}`}>
                    {weather.environment?.airQuality.usAqi ?? '--'}
                  </p>
                  {weather.environment?.airQuality.usAqi !== null && (
                    <p className={`text-2xs ${aqiLevel(weather.environment.airQuality.usAqi).color}`}>
                      {aqiLevel(weather.environment.airQuality.usAqi).label}
                    </p>
                  )}
                </div>
                <div className="card-inner p-3">
                  <p className="text-2xs text-faint">Visibility</p>
                  <p className="text-lg font-bold font-mono text-secondary">
                    {weather.environment?.current.visibility !== null ? formatVisibility(weather.environment.current.visibility) : '--'}
                  </p>
                </div>
                <div className="card-inner p-3">
                  <p className="text-2xs text-faint">Solar Radiation</p>
                  <p className="text-lg font-bold font-mono text-yellow-400">
                    {weather.environment?.current.solarRadiation !== null ? `${Math.round(weather.environment.current.solarRadiation)}` : '--'}
                  </p>
                  <p className="text-2xs text-faint">W/m²</p>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="card p-5">
              <span className="label">Additional</span>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <div className="card-inner p-3 flex items-center justify-between">
                  <span className="text-xs text-muted">Precipitation</span>
                  <span className="text-sm font-bold text-secondary font-mono">
                    {weather.environment?.current.precipitationProbability !== null ? `${weather.environment.current.precipitationProbability}%` : '--'}
                  </span>
                </div>
                <div className="card-inner p-3 flex items-center justify-between">
                  <span className="text-xs text-muted">Wind Gusts</span>
                  <span className="text-sm font-bold text-secondary font-mono">
                    {weather.environment?.current.windGusts !== null ? `${Math.round(weather.environment.current.windGusts)} mph` : '--'}
                  </span>
                </div>
                <div className="card-inner p-3 flex items-center justify-between">
                  <span className="text-xs text-muted">PM2.5</span>
                  <span className="text-sm font-bold text-secondary font-mono">
                    {weather.environment?.airQuality.pm2_5 !== null ? `${weather.environment.airQuality.pm2_5.toFixed(1)} µg/m³` : '--'}
                  </span>
                </div>
                <div className="card-inner p-3 flex items-center justify-between">
                  <span className="text-xs text-muted">Ozone</span>
                  <span className="text-sm font-bold text-secondary font-mono">
                    {weather.environment?.airQuality.ozone !== null ? `${weather.environment.airQuality.ozone.toFixed(0)} µg/m³` : '--'}
                  </span>
                </div>
                {weather.satellites && weather.satellites.length > 0 && (
                  <div className="card-inner p-3 flex items-center justify-between">
                    <span className="text-xs text-muted">Next Satellite</span>
                    <span className="text-xs font-medium text-brand-bright">
                      {weather.satellites[0].satellite} &middot; {new Date(weather.satellites[0].riseTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Forecast */}
          <div className="card p-5">
            <span className="label">7-Day Forecast</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 mt-3">
              {weather.forecast.map((period, i) => (
                <div key={i} className="card-inner p-2.5 text-center">
                  <p className="text-2xs text-muted truncate">{period.name}</p>
                  <p className="text-lg font-bold text-primary mt-1">{period.temperature}°</p>
                  <p className="text-2xs text-faint mt-1 line-clamp-2">{period.shortForecast}</p>
                  <p className="text-2xs text-faint mt-0.5">{period.windSpeed} {period.windDirection}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ENVIRONMENT TAB ═══ */}
      {tab === 'environment' && weather?.environment && (
        <div className="space-y-4">
          {/* Air Quality detail */}
          <div className="card p-5">
            <span className="label">Air Quality</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div className="card-inner p-4 text-center">
                <p className="text-2xs text-faint">US AQI</p>
                <p className={`text-3xl font-bold font-mono mt-1 ${weather.environment.airQuality.usAqi !== null ? aqiLevel(weather.environment.airQuality.usAqi).color : 'text-muted'}`}>
                  {weather.environment.airQuality.usAqi ?? '--'}
                </p>
                {weather.environment.airQuality.usAqi !== null && (
                  <p className={`text-xs mt-1 ${aqiLevel(weather.environment.airQuality.usAqi).color}`}>
                    {aqiLevel(weather.environment.airQuality.usAqi).label}
                  </p>
                )}
              </div>
              <div className="card-inner p-4 text-center">
                <p className="text-2xs text-faint">PM2.5</p>
                <p className="text-2xl font-bold font-mono mt-1 text-secondary">
                  {weather.environment.airQuality.pm2_5?.toFixed(1) ?? '--'}
                </p>
                <p className="text-2xs text-faint mt-1">µg/m³</p>
              </div>
              <div className="card-inner p-4 text-center">
                <p className="text-2xs text-faint">PM10</p>
                <p className="text-2xl font-bold font-mono mt-1 text-secondary">
                  {weather.environment.airQuality.pm10?.toFixed(1) ?? '--'}
                </p>
                <p className="text-2xs text-faint mt-1">µg/m³</p>
              </div>
              <div className="card-inner p-4 text-center">
                <p className="text-2xs text-faint">Ozone</p>
                <p className="text-2xl font-bold font-mono mt-1 text-secondary">
                  {weather.environment.airQuality.ozone?.toFixed(0) ?? '--'}
                </p>
                <p className="text-2xs text-faint mt-1">µg/m³</p>
              </div>
            </div>
          </div>

          {/* UV & Solar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="card p-5">
              <span className="label">UV Index &mdash; 24hr Forecast</span>
              <div className="mt-3 flex items-end gap-0.5 h-24">
                {weather.environment.hourly.slice(0, 24).map((h, i) => {
                  const uv = h.uvIndex ?? 0;
                  const maxUv = Math.max(...weather.environment.hourly.map((x) => x.uvIndex ?? 0), 1);
                  const height = (uv / maxUv) * 100;
                  const hour = new Date(h.time).getHours();
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${hour}:00 — UV ${uv.toFixed(1)}`}>
                      <div
                        className={`w-full rounded-sm transition-all ${uv > 7 ? 'bg-red-400' : uv > 5 ? 'bg-orange-400' : uv > 2 ? 'bg-yellow-400' : 'bg-green-400/50'}`}
                        style={{ height: `${Math.max(height, 2)}%` }}
                      />
                      {i % 4 === 0 && <span className="text-2xs text-faint">{hour}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="card p-5">
              <span className="label">Precipitation Probability &mdash; 24hr</span>
              <div className="mt-3 flex items-end gap-0.5 h-24">
                {weather.environment.hourly.slice(0, 24).map((h, i) => {
                  const prob = h.precipitationProbability ?? 0;
                  const hour = new Date(h.time).getHours();
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${hour}:00 — ${prob}%`}>
                      <div
                        className={`w-full rounded-sm transition-all ${prob > 60 ? 'bg-blue-400' : prob > 30 ? 'bg-blue-300/70' : 'bg-blue-200/30'}`}
                        style={{ height: `${Math.max(prob, 2)}%` }}
                      />
                      {i % 4 === 0 && <span className="text-2xs text-faint">{hour}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Hourly detail table */}
          <div className="card p-5">
            <span className="label">Hourly Breakdown</span>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-b-[var(--color-border)]">
                    <th className="text-left py-2 text-faint font-medium">Time</th>
                    <th className="text-right py-2 text-faint font-medium">UV</th>
                    <th className="text-right py-2 text-faint font-medium">Precip</th>
                    <th className="text-right py-2 text-faint font-medium">Visibility</th>
                    <th className="text-right py-2 text-faint font-medium">Solar</th>
                    <th className="text-right py-2 text-faint font-medium">Dewpoint</th>
                    <th className="text-right py-2 text-faint font-medium">Gusts</th>
                  </tr>
                </thead>
                <tbody>
                  {weather.environment.hourly.slice(0, 12).map((h, i) => (
                    <tr key={i} className="border-b border-b-[var(--color-border)]/50">
                      <td className="py-1.5 text-muted">{new Date(h.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
                      <td className={`py-1.5 text-right font-mono ${h.uvIndex !== null ? uvLevel(h.uvIndex).color : 'text-muted'}`}>
                        {h.uvIndex?.toFixed(1) ?? '--'}
                      </td>
                      <td className="py-1.5 text-right font-mono text-secondary">{h.precipitationProbability ?? '--'}%</td>
                      <td className="py-1.5 text-right font-mono text-secondary">{h.visibility !== null ? formatVisibility(h.visibility) : '--'}</td>
                      <td className="py-1.5 text-right font-mono text-secondary">{h.solarRadiation !== null ? `${Math.round(h.solarRadiation)} W` : '--'}</td>
                      <td className="py-1.5 text-right font-mono text-secondary">{h.dewpoint !== null ? `${Math.round(h.dewpoint)}°` : '--'}</td>
                      <td className="py-1.5 text-right font-mono text-secondary">{h.windGusts !== null ? `${Math.round(h.windGusts)} mph` : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SATELLITES TAB ═══ */}
      {tab === 'satellites' && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="label">NOAA Satellite Passes</span>
                <p className="text-xs text-muted mt-1">137 MHz APT downlinks &middot; Next 24 hours &middot; Mesa, AZ</p>
              </div>
              <div className="text-right">
                <p className="text-2xs text-faint">Min elevation: 15°</p>
                <p className="text-2xs text-faint">Receiver: E4000 (65-2300 MHz)</p>
              </div>
            </div>

            {weather?.satellites && weather.satellites.length > 0 ? (
              <div className="space-y-2">
                {weather.satellites.map((pass, i) => {
                  const rise = new Date(pass.riseTime);
                  const set = new Date(pass.setTime);
                  const isUpcoming = rise.getTime() > Date.now();
                  const isActive = rise.getTime() <= Date.now() && set.getTime() >= Date.now();
                  return (
                    <div key={i} className={`card-inner p-4 ${isActive ? 'border-live/40 bg-live/5' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isActive && <div className="w-2 h-2 rounded-full bg-live animate-pulse-live" />}
                          <div>
                            <p className="text-sm font-semibold text-primary">{pass.satellite}</p>
                            <p className="text-xs text-muted mt-0.5">{pass.frequency.toFixed(4)} MHz &middot; {pass.direction}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono text-secondary">
                            {rise.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            {' → '}
                            {set.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                          <p className="text-2xs text-faint mt-0.5">
                            {Math.round(pass.duration / 60)} min &middot; Max {pass.maxElevation}° el
                          </p>
                        </div>
                      </div>
                      {/* Elevation indicator bar */}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-2xs text-faint w-8">Elev</span>
                        <div className="flex-1 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pass.maxElevation >= 60 ? 'bg-green-400' : pass.maxElevation >= 30 ? 'bg-yellow-400' : 'bg-orange-400'}`}
                            style={{ width: `${(pass.maxElevation / 90) * 100}%` }}
                          />
                        </div>
                        <span className="text-2xs font-mono text-muted w-8">{pass.maxElevation}°</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card-inner p-6 text-center">
                <p className="text-sm text-muted">No passes predicted in the next 24 hours</p>
                <p className="text-xs text-faint mt-1">TLE data may still be loading from Celestrak</p>
              </div>
            )}
          </div>

          {/* Satellite info */}
          <div className="card p-5">
            <span className="label">NOAA Polar-Orbiting Satellites</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {[
                { name: 'NOAA-15', id: 25338, freq: '137.6200', launched: '1998', status: 'Degraded APT' },
                { name: 'NOAA-18', id: 28654, freq: '137.9125', launched: '2005', status: 'Active' },
                { name: 'NOAA-19', id: 33591, freq: '137.1000', launched: '2009', status: 'Active' },
              ].map((s) => (
                <div key={s.id} className="card-inner p-3">
                  <p className="text-sm font-semibold text-primary">{s.name}</p>
                  <div className="mt-2 space-y-1">
                    <p className="text-2xs text-muted">NORAD: {s.id}</p>
                    <p className="text-2xs text-muted">Downlink: {s.freq} MHz</p>
                    <p className="text-2xs text-muted">Launched: {s.launched}</p>
                    <p className={`text-2xs font-medium ${s.status === 'Active' ? 'text-green-400' : 'text-yellow-400'}`}>{s.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ RADAR TAB ═══ */}
      {tab === 'radar' && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="label">NWS Radar</span>
                <p className="text-xs text-muted mt-1">KIWA (Mesa Gateway) &middot; Base Reflectivity</p>
              </div>
              <a
                href="https://radar.weather.gov/?settings=v1_eyJhZ2VuZGEiOnsiaWQiOiJsb2NhbCIsImNlbnRlciI6Wy0xMTEuODMsMzMuNDJdLCJ6b29tIjo4fX0%3D"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-bright hover:underline"
              >
                Full Screen ↗
              </a>
            </div>
            <div className="rounded-lg overflow-hidden border border-[var(--color-border)]">
              <iframe
                src="https://radar.weather.gov/?settings=v1_eyJhZ2VuZGEiOnsiaWQiOiJsb2NhbCIsImNlbnRlciI6Wy0xMTEuODMsMzMuNDJdLCJ6b29tIjo4fX0%3D"
                className="w-full h-[500px] border-0"
                title="NWS Radar - Mesa, AZ"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══ RADIO TAB ═══ */}
      {tab === 'radio' && (
        <div className="space-y-4">
          {/* Radio tuner card */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <span className="label">NOAA Weather Radio</span>
                <p className="text-xs text-muted mt-0.5">162.400 &ndash; 162.550 MHz &middot; Narrowband FM</p>
              </div>
              <div className="flex items-center gap-3">
                {audio.error && <span className="text-xs text-danger">{audio.error}</span>}
                {audio.isConnecting && <span className="text-xs text-muted">Tuning...</span>}
                <button onClick={togglePower} className={power ? 'btn-danger btn-sm' : 'btn-brand btn-sm'}>
                  {power ? 'Power Off' : 'Power On'}
                </button>
              </div>
            </div>

            {/* Frequency display */}
            <div className="flex items-baseline gap-3 mb-5">
              <span className="freq-display">{frequency.toFixed(3)}</span>
              <span className="text-sm text-muted">MHz</span>
              {power && audio.isPlaying && (
                <div className="flex items-center gap-1.5 ml-3">
                  <div className="w-2 h-2 rounded-full bg-live animate-pulse-live" />
                  <span className="text-xs text-live font-medium">LIVE</span>
                </div>
              )}
            </div>

            {/* Station info */}
            {currentStation && (
              <div className="card-inner p-3 mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-primary">{currentStation.label}</p>
                    <p className="text-xs text-muted mt-0.5">{currentStation.desc}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-secondary">{currentStation.area}</p>
                    <p className="text-2xs text-faint mt-0.5">{currentStation.power} ERP</p>
                  </div>
                </div>
              </div>
            )}

            {/* Volume */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">Vol</span>
              <input type="range" min="0" max="100" value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="flex-1 h-1 rounded-full appearance-none cursor-pointer accent-brand"
                style={{ background: `linear-gradient(to right, var(--color-primary) ${volume}%, var(--color-border) ${volume}%)` }}
              />
              <span className="text-xs font-mono text-muted w-8">{volume}%</span>
            </div>
          </div>

          {/* Meters */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-3 card p-4">
              <span className="label">Spectrum</span>
              <div className="mt-2">
                <SpectrumVisualizer getFrequencyData={audio.getFrequencyData} isActive={power && audio.isPlaying} color="#f59e0b" height={90} />
              </div>
            </div>
            <div className="card p-4">
              <span className="label">Signal</span>
              <div className="mt-2">
                <SignalMeter getSignalLevel={audio.getSignalLevel} isActive={power && audio.isPlaying} color="#f59e0b" />
              </div>
            </div>
          </div>

          {/* Station list */}
          <div className="card p-4">
            <span className="label">NOAA Weather Stations &mdash; Arizona</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              {stations.map((s) => (
                <button
                  key={s.freq}
                  onClick={() => setFrequency(s.freq)}
                  className={`card-inner p-3 text-left transition-all hover:border-warn/30 ${
                    frequency === s.freq ? 'border-warn/40 bg-warn/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-secondary">{s.label}</p>
                      <p className="text-2xs text-muted mt-0.5">{s.desc}</p>
                    </div>
                    <span className="text-xs font-mono text-faint">{s.freq.toFixed(3)}</span>
                  </div>
                  <p className="text-2xs text-faint mt-1">{s.area}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default WeatherRadio;
