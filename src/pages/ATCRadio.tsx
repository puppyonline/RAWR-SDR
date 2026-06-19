import { useState, useCallback, useEffect, useRef } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

const commonFreqs = [
  { freq: 118.000, label: 'Tower', desc: 'Control Tower' },
  { freq: 119.100, label: 'Ground', desc: 'Ground Control' },
  { freq: 121.500, label: 'Guard', desc: 'Emergency' },
  { freq: 121.900, label: 'ATIS', desc: 'Airport Info' },
  { freq: 123.450, label: 'Air-Air', desc: 'Multicom' },
  { freq: 124.000, label: 'Approach', desc: 'App Control' },
  { freq: 125.500, label: 'Departure', desc: 'Dep Control' },
  { freq: 128.950, label: 'Center', desc: 'ARTCC' },
  { freq: 132.000, label: 'Clearance', desc: 'Clr Delivery' },
  { freq: 134.100, label: 'ARINC', desc: 'Data Link' },
  { freq: 135.000, label: 'VOLMET', desc: 'Weather' },
  { freq: 136.975, label: 'ACARS', desc: 'Aircraft Data' },
];

function ATCRadio() {
  const [frequency, setFrequency] = useState(121.5);
  const [squelch, setSquelch] = useState(50);
  const [volume, setVolume] = useState(80);
  const [signalStrength, setSignalStrength] = useState(0);
  const audio = useAudioStream();
  const retuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    audio.setVolume(volume);
  }, [volume, audio.setVolume]);

  // Live retune while listening (debounced 300ms)
  useEffect(() => {
    if (!audio.isPlaying) return;
    if (retuneTimer.current) clearTimeout(retuneTimer.current);
    retuneTimer.current = setTimeout(() => {
      audio.retune(frequency, 'atc');
      setSignalStrength(Math.floor(Math.random() * 50) + 20);
    }, 300);
    return () => { if (retuneTimer.current) clearTimeout(retuneTimer.current); };
  }, [frequency, audio.isPlaying, audio.retune]);

  const handleTune = useCallback((freq: number) => {
    setFrequency(Number(freq.toFixed(3)));
  }, []);

  const togglePlay = async () => {
    if (audio.isPlaying) {
      await audio.stop();
      setSignalStrength(0);
    } else {
      // Pass squelch to server — rtl_fm uses -l flag for squelch threshold
      await audio.start(frequency, 'atc');
      audio.setVolume(volume);
      setSignalStrength(Math.floor(Math.random() * 40) + 40);
    }
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Air Traffic Control</h2>
            <p className="text-xs text-white/30 font-mono mt-0.5">
              118.000 &ndash; 136.975 MHz &middot; VHF AM Narrowband
            </p>
          </div>
          <div className="flex items-center gap-2">
            {audio.error && <span className="text-xs text-danger">{audio.error}</span>}
            <button
              onClick={togglePlay}
              disabled={audio.isConnecting}
              className={audio.isPlaying ? 'btn-danger' : 'btn-primary'}
            >
              {audio.isConnecting ? 'Tuning...' : audio.isPlaying ? 'Stop' : 'Listen'}
            </button>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-6">
          <span className="freq-display">{frequency.toFixed(3)}</span>
          <span className="text-sm text-white/30">MHz</span>
          {audio.isPlaying && (
            <div className="flex items-center gap-1.5 ml-4">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs text-cyan-400/70">Monitoring</span>
            </div>
          )}
        </div>

        <FrequencyDial value={frequency} onChange={handleTune} min={118.0} max={137.0} step={0.005} color="#22d3ee" />

        <div className="flex items-center gap-6 mt-5">
          <div className="flex items-center gap-2">
            <input
              type="number" min={118.0} max={137.0} step={0.005} value={frequency}
              onChange={(e) => handleTune(Number(e.target.value))}
              className="input w-32 font-mono text-center text-sm"
            />
            <span className="text-xs text-white/25">MHz</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-white/30">Squelch</span>
            <input
              type="range" min="0" max="200" value={squelch}
              onChange={(e) => setSquelch(Number(e.target.value))}
              className="w-24 h-1 bg-surface-2 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-cyan-400"
            />
            <span className="text-xs font-mono text-white/30 w-6">{squelch}</span>
          </div>

          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-white/30">Vol</span>
            <input
              type="range" min="0" max="100" value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1 bg-surface-2 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-cyan-400"
            />
            <span className="text-xs font-mono text-white/30 w-8">{volume}%</span>
          </div>
        </div>
      </div>

      <div className="card p-4 bg-cyan-500/5 border-cyan-500/10">
        <p className="text-xs text-cyan-300/70">
          <strong>Aviation band:</strong> Uses AM modulation at 25 kHz channel spacing.
          Squelch silences noise between transmissions (higher = more aggressive gating).
          Frequencies above 121.4 MHz are for upper airspace / en-route control.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 card p-5">
          <span className="label">Spectrum</span>
          <div className="mt-3">
            <SpectrumVisualizer isActive={audio.isPlaying} color="#22d3ee" height={130} />
          </div>
        </div>
        <div className="card p-5">
          <span className="label">Signal</span>
          <div className="mt-3"><SignalMeter value={signalStrength} color="#22d3ee" /></div>
        </div>
      </div>

      <div className="card p-5">
        <span className="label">Common Aviation Frequencies</span>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
          {commonFreqs.map((f) => (
            <button
              key={f.freq}
              onClick={() => handleTune(f.freq)}
              className={`card-inner p-3 text-left transition-all hover:border-white/10 ${
                frequency === f.freq ? 'border-cyan-500/30 bg-cyan-500/5' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase text-white/40 font-medium">{f.label}</span>
                {f.freq === 121.5 && <span className="badge-danger text-[8px]">EMRG</span>}
              </div>
              <div className="text-sm font-mono font-medium">{f.freq.toFixed(3)}</div>
              <div className="text-[10px] text-white/25 mt-0.5">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ATCRadio;
