import { useState, useCallback } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';

function AMRadio() {
  const [frequency, setFrequency] = useState(1010);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [signalStrength, setSignalStrength] = useState(58);

  const handleTune = useCallback((freq: number) => {
    setFrequency(freq);
    setSignalStrength(Math.floor(Math.random() * 35) + 40);
  }, []);

  const presets = [
    { freq: 580, name: 'NEWS' },
    { freq: 710, name: 'TALK' },
    { freq: 880, name: 'SPORTS' },
    { freq: 1010, name: 'WINS' },
    { freq: 1180, name: 'RADIO' },
    { freq: 1500, name: 'WFED' },
  ];

  return (
    <div className="space-y-4">
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">AM Radio</h2>
            <p className="text-white/50 text-sm">530 - 1700 kHz</p>
          </div>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isPlaying
                ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30'
                : 'glass-button'
            }`}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>

        <div className="text-center mb-6">
          <div className="text-6xl font-bold bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text text-transparent tabular-nums">
            {frequency.toFixed(0)}
          </div>
          <div className="text-white/40 text-sm mt-1">kHz AM</div>
        </div>

        <FrequencyDial value={frequency} onChange={handleTune} min={530} max={1700} step={10} />
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
              className="w-full accent-amber-400"
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
                frequency === p.freq ? 'border-amber-400/50 bg-amber-500/20' : ''
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

export default AMRadio;
