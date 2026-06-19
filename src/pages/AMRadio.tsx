import { useState, useEffect, useRef } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

const presets = [
  { freq: 580, label: 'WDBO' },
  { freq: 660, label: 'WFAN' },
  { freq: 770, label: 'WABC' },
  { freq: 880, label: 'WCBS' },
  { freq: 1010, label: 'WINS' },
  { freq: 1130, label: 'WBBR' },
  { freq: 1280, label: 'WADO' },
  { freq: 1560, label: 'WQEW' },
];

function AMRadio() {
  const [frequency, setFrequency] = useState(880);
  const [volume, setVolume] = useState(70);
  const [signalStrength, setSignalStrength] = useState(0);
  const [power, setPower] = useState(false);
  const audio = useAudioStream();
  const tuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTune = useRef(false);

  useEffect(() => { audio.setVolume(volume); }, [volume, audio.setVolume]);

  useEffect(() => {
    if (power && !initialTune.current) {
      initialTune.current = true;
      audio.tune(frequency, 'am');
      setSignalStrength(Math.floor(Math.random() * 30) + 45);
    }
    if (!power) initialTune.current = false;
  }, [power]);

  useEffect(() => {
    if (!power) return;
    if (tuneTimer.current) clearTimeout(tuneTimer.current);
    tuneTimer.current = setTimeout(() => {
      audio.tune(frequency, 'am');
      setSignalStrength(Math.floor(Math.random() * 30) + 40);
    }, 350);
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
            <h2 className="text-lg font-semibold">AM Broadcast</h2>
            <p className="text-xs text-white/30 font-mono mt-0.5">
              530 &ndash; 1700 kHz &middot; Direct Sampling AM
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
          <span className="freq-display">{frequency}</span>
          <span className="text-sm text-white/30">kHz</span>
          {power && audio.isPlaying && (
            <div className="flex items-center gap-1.5 ml-4">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-success/70">Live</span>
            </div>
          )}
        </div>

        <FrequencyDial value={frequency} onChange={(f) => setFrequency(Math.round(f))} min={530} max={1700} step={10} color="#f59e0b" />

        <div className="flex items-center gap-6 mt-5">
          <div className="flex items-center gap-2">
            <input
              type="number" min={530} max={1700} step={10} value={frequency}
              onChange={(e) => setFrequency(Math.round(Number(e.target.value)))}
              className="input w-28 font-mono text-center text-sm"
            />
            <span className="text-xs text-white/25">kHz</span>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-white/30">Vol</span>
            <input
              type="range" min="0" max="100" value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1 bg-surface-2 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-warning"
            />
            <span className="text-xs font-mono text-white/30 w-8">{volume}%</span>
          </div>
        </div>
      </div>

      <div className="card p-4 bg-amber-500/5 border-amber-500/10">
        <p className="text-xs text-amber-300/70">
          <strong>Note:</strong> AM uses direct sampling (-E direct). Requires RTL-SDR Blog V3 or HF-capable dongle.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 card p-5">
          <span className="label">Spectrum</span>
          <div className="mt-3">
            <SpectrumVisualizer isActive={power && audio.isPlaying} color="#f59e0b" height={140} />
          </div>
        </div>
        <div className="card p-5">
          <span className="label">Signal</span>
          <div className="mt-3"><SignalMeter value={signalStrength} color="#f59e0b" /></div>
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
                frequency === p.freq ? 'border-warning/30 bg-warning/5' : ''
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

export default AMRadio;
