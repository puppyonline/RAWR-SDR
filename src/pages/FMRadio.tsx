import { useState, useEffect, useRef } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

const presets = [
  { freq: 88.1, label: 'NPR' },
  { freq: 91.5, label: 'WBGO' },
  { freq: 95.5, label: 'WPLJ' },
  { freq: 97.1, label: 'WASH' },
  { freq: 100.3, label: 'WHTZ' },
  { freq: 102.7, label: 'WNEW' },
  { freq: 104.3, label: 'WAXQ' },
  { freq: 106.7, label: 'WLTW' },
];

function FMRadio() {
  const [frequency, setFrequency] = useState(97.1);
  const [volume, setVolume] = useState(80);
  const [signalStrength, setSignalStrength] = useState(0);
  const [power, setPower] = useState(false);
  const audio = useAudioStream();
  const tuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTune = useRef(false);

  // Volume sync
  useEffect(() => { audio.setVolume(volume); }, [volume, audio.setVolume]);

  // When power is turned on, tune immediately
  useEffect(() => {
    if (power && !initialTune.current) {
      initialTune.current = true;
      audio.tune(frequency, 'fm');
      setSignalStrength(Math.floor(Math.random() * 30) + 60);
    }
    if (!power) {
      initialTune.current = false;
    }
  }, [power]);

  // Retune on frequency change while powered on (debounced 250ms)
  useEffect(() => {
    if (!power) return;
    if (tuneTimer.current) clearTimeout(tuneTimer.current);
    tuneTimer.current = setTimeout(() => {
      audio.tune(frequency, 'fm');
      setSignalStrength(Math.floor(Math.random() * 30) + 55);
    }, 250);
    return () => { if (tuneTimer.current) clearTimeout(tuneTimer.current); };
  }, [frequency]);

  const togglePower = async () => {
    if (power) {
      setPower(false);
      await audio.stop();
      setSignalStrength(0);
    } else {
      setPower(true);
    }
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">FM Broadcast</h2>
            <p className="text-xs text-white/30 font-mono mt-0.5">
              87.5 &ndash; 108.0 MHz &middot; Wideband FM
            </p>
          </div>
          <div className="flex items-center gap-3">
            {audio.error && <span className="text-xs text-danger mr-2">{audio.error}</span>}
            {audio.isConnecting && <span className="text-xs text-white/40 mr-2">Tuning...</span>}
            <button onClick={togglePower} className={power ? 'btn-danger' : 'btn-primary'}>
              {power ? 'Power Off' : 'Power On'}
            </button>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-6">
          <span className="freq-display">{frequency.toFixed(1)}</span>
          <span className="text-sm text-white/30">MHz</span>
          {power && audio.isPlaying && (
            <div className="flex items-center gap-1.5 ml-4">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-success/70">Live</span>
            </div>
          )}
        </div>

        <FrequencyDial value={frequency} onChange={(f) => setFrequency(Number(f.toFixed(1)))} min={87.5} max={108.0} step={0.1} />

        <div className="flex items-center gap-6 mt-5">
          <div className="flex items-center gap-2">
            <input
              type="number" min={87.5} max={108.0} step={0.1} value={frequency}
              onChange={(e) => setFrequency(Number(Number(e.target.value).toFixed(1)))}
              className="input w-28 font-mono text-center text-sm"
            />
            <span className="text-xs text-white/25">MHz</span>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-white/30">Vol</span>
            <input
              type="range" min="0" max="100" value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1 bg-surface-2 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-accent"
            />
            <span className="text-xs font-mono text-white/30 w-8">{volume}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 card p-5">
          <span className="label">Spectrum</span>
          <div className="mt-3">
            <SpectrumVisualizer isActive={power && audio.isPlaying} color="#6366f1" height={140} />
          </div>
        </div>
        <div className="card p-5">
          <span className="label">Signal</span>
          <div className="mt-3"><SignalMeter value={signalStrength} /></div>
        </div>
      </div>

      <div className="card p-5">
        <span className="label">Presets</span>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mt-3">
          {presets.map((p) => (
            <button
              key={p.freq}
              onClick={() => setFrequency(p.freq)}
              className={`card-inner py-3 px-2 text-center transition-all hover:border-white/10 ${
                frequency === p.freq ? 'border-accent/30 bg-accent/5' : ''
              }`}
            >
              <div className="text-[10px] text-white/30 mb-0.5">{p.label}</div>
              <div className="text-xs font-mono font-medium">{p.freq}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FMRadio;
