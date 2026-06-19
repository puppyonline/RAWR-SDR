import { useState, useCallback } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';

function FMRadio() {
  const [frequency, setFrequency] = useState(98.1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(75);
  const [signalStrength, setSignalStrength] = useState(72);

  const handleTune = useCallback((freq: number) => {
    setFrequency(freq);
    setSignalStrength(Math.floor(Math.random() * 40) + 50);
  }, []);

  const presets = [
    { freq: 87.9, name: 'KXYZ' },
    { freq: 91.5, name: 'NPR' },
    { freq: 95.7, name: 'ROCK' },
    { freq: 98.1, name: 'HITS' },
    { freq: 101.3, name: 'JAZZ' },
    { freq: 104.7, name: 'CLAS' },
  ];

  return (
    <div className="space-y-4">
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">FM Radio</h2>
            <p className="text-white/50 text-sm">87.5 - 108.0 MHz</p>
          </div>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isPlaying
                ? 'bg-gradient-to-br from-purple-500 to-cyan-500 shadow-lg shadow-purple-500/30'
                : 'glass-button'
            }`}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>

        <div className="text-center mb-6">
          <div className="text-6xl font-bold bg-gradient-to-r from-purple-300 to-cyan-300 bg-clip-text text-transparent tabular-nums">
            {frequency.toFixed(1)}
          </div>
          <div className="text-white/40 text-sm mt-1">MHz FM</div>
        </div>

        <FrequencyDial value={frequency} onChange={handleTune} min={87.5} max={108.0} step={0.1} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-panel p-6">
          <h3 className="text-sm font-semibold text-white/70 mb-3">Spectrum</h3>
          <SpectrumVisualizer isActive={isPlaying} />
        </div>

        <div className="space-y-4">
          <div className="glass-panel p-6">
            <h3 className="text-sm font-semibold text-white/70 mb-3">Signal</h3>
            <SignalMeter value={signalStrength} />
          </div>
          <div className="glass-panel p-6">
            <h3 className="text-sm font-semibold text-white/70 mb-3">Volume</h3>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full accent-purple-400"
            />
            <div className="text-center text-sm text-white/50 mt-1">{volume}%</div>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-semibold text-white/70 mb-3">Presets</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {presets.map((p) => (
            <button
              key={p.freq}
              onClick={() => handleTune(p.freq)}
              className={`glass-button text-center py-3 ${
                frequency === p.freq ? 'border-purple-400/50 bg-purple-500/20' : ''
              }`}
            >
              <div className="text-xs text-white/50">{p.name}</div>
              <div className="text-sm font-semibold">{p.freq}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FMRadio;
