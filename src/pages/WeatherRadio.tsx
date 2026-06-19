import { useState, useEffect, useRef } from 'react';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

// NOAA Weather Radio frequencies for Phoenix/Mesa area
// NWR broadcasts on 7 frequencies nationwide. Phoenix uses these:
const stations = [
  { freq: 162.550, label: 'WXL-58', desc: 'Phoenix/Mesa (primary)', area: 'Maricopa County', power: '300W' },
  { freq: 162.400, label: 'KEC-81', desc: 'Phoenix/Scottsdale', area: 'Central Maricopa', power: '300W' },
  { freq: 162.475, label: 'WNG-720', desc: 'Prescott/Yavapai', area: 'Yavapai County', power: '300W' },
  { freq: 162.425, label: 'WXJ-69', desc: 'Tucson', area: 'Pima County', power: '1000W' },
  { freq: 162.450, label: 'WXL-59', desc: 'Flagstaff', area: 'Coconino County', power: '300W' },
  { freq: 162.500, label: 'KIH-26', desc: 'Globe/Payson', area: 'Gila County', power: '300W' },
  { freq: 162.525, label: 'WXK-88', desc: 'Kingman', area: 'Mohave County', power: '300W' },
];

function WeatherRadio() {
  const [frequency, setFrequency] = useState(162.550);
  const [volume, setVolume] = useState(80);
  const [power, setPower] = useState(false);
  const audio = useAudioStream();
  const tuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTune = useRef(false);

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

      {/* About */}
      <div className="card p-4">
        <span className="label">About NOAA Weather Radio</span>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          NOAA Weather Radio All Hazards (NWR) broadcasts continuous weather information directly from National Weather Service offices.
          It provides forecasts, current conditions, watches, warnings, and emergency alerts 24/7.
          The Phoenix transmitter (WXL-58 on 162.550 MHz) covers the entire Mesa/Phoenix metro area.
        </p>
      </div>
    </div>
  );
}

export default WeatherRadio;
