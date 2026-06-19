import { useState, useEffect, useRef } from 'react';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

// ─── Types ─────────────────────────────────────────────────────────────────

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
}

// NOAA Weather Radio frequencies receivable from Mesa, AZ (85202)
// Only Phoenix-area transmitters within ~40 mile range
const stations = [
  { freq: 162.550, label: 'WXL-58', desc: 'Phoenix (primary)', area: 'Maricopa County', power: '300W' },
  { freq: 162.500, label: 'KEC-81', desc: 'Globe / Signal Peak (weak)', area: 'Gila County', power: '300W' },
];

function WeatherRadio() {
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

    // Refresh every 5 min
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

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="section-title">NOAA Weather Radio</h2>
            <p className="section-subtitle mt-0.5">162.400 &ndash; 162.550 MHz &middot; Narrowband FM</p>
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

      {/* Weather Dashboard */}
      {weather && (
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
                  <p className="text-2xs text-faint">Updated</p>
                  <p className="text-sm font-medium text-secondary">
                    {weather.current.timestamp ? new Date(weather.current.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Forecast */}
          <div className="lg:col-span-2 card p-5">
            <span className="label">Forecast</span>
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

      {/* Active alerts */}
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
                  <span className="text-2xs text-faint">Expires: {new Date(alert.expires).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Station list */}
      <div className="card p-4">
        <span className="label">NOAA Weather Stations &mdash; Arizona</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
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
  );
}

export default WeatherRadio;
