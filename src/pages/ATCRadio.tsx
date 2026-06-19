import { useState, useCallback } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';

const commonFrequencies = [
  { freq: 118.0, name: 'Tower', desc: 'Local Tower' },
  { freq: 119.1, name: 'Ground', desc: 'Ground Control' },
  { freq: 121.5, name: 'Guard', desc: 'Emergency' },
  { freq: 123.45, name: 'Air-Air', desc: 'Pilot-to-Pilot' },
  { freq: 124.0, name: 'Approach', desc: 'Approach Control' },
  { freq: 125.5, name: 'Departure', desc: 'Departure Control' },
  { freq: 128.95, name: 'Center', desc: 'ARTCC' },
  { freq: 132.0, name: 'Clearance', desc: 'Clearance Delivery' },
];

function ATCRadio() {
  const [frequency, setFrequency] = useState(121.5);
  const [isListening, setIsListening] = useState(false);
  const [signalStrength, setSignalStrength] = useState(45);
  const [squelch, setSquelch] = useState(30);
  const [scanning, setScanning] = useState(false);

  const handleTune = useCallback((freq: number) => {
    setFrequency(freq);
    setSignalStrength(Math.floor(Math.random() * 50) + 20);
  }, []);

  return (
    <div className="space-y-4">
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">ATC Scanner</h2>
            <p className="text-white/50 text-sm">118.0 - 137.0 MHz Aviation Band</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setScanning(!scanning)}
              className={`glass-button text-sm ${scanning ? 'bg-cyan-500/20 border-cyan-400/50' : ''}`}
            >
              {scanning ? '⏹ Stop Scan' : '🔍 Scan'}
            </button>
            <button
              onClick={() => setIsListening(!isListening)}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/30'
                  : 'glass-button'
              }`}
            >
              {isListening ? '⏸' : '▶'}
            </button>
          </div>
        </div>

        <div className="text-center mb-6">
          <div className="text-6xl font-bold bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent tabular-nums">
            {frequency.toFixed(3)}
          </div>
          <div className="text-white/40 text-sm mt-1">MHz AM Aviation</div>
        </div>

        <FrequencyDial value={frequency} onChange={handleTune} min={118.0} max={137.0} step={0.005} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-panel p-6">
          <h3 className="text-sm font-semibold text-white/70 mb-3">Spectrum</h3>
          <SpectrumVisualizer isActive={isListening} />
        </div>

        <div className="space-y-4">
          <div className="glass-panel p-6">
            <h3 className="text-sm font-semibold text-white/70 mb-3">Signal</h3>
            <SignalMeter value={signalStrength} />
          </div>
          <div className="glass-panel p-6">
            <h3 className="text-sm font-semibold text-white/70 mb-3">Squelch</h3>
            <input
              type="range"
              min="0"
              max="100"
              value={squelch}
              onChange={(e) => setSquelch(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
            <div className="text-center text-sm text-white/50 mt-1">{squelch}%</div>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-semibold text-white/70 mb-3">Common Frequencies</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {commonFrequencies.map((f) => (
            <button
              key={f.freq}
              onClick={() => handleTune(f.freq)}
              className={`glass-button text-left py-3 px-4 ${
                frequency === f.freq ? 'border-cyan-400/50 bg-cyan-500/20' : ''
              }`}
            >
              <div className="text-xs text-white/50">{f.name}</div>
              <div className="text-sm font-semibold">{f.freq.toFixed(3)}</div>
              <div className="text-xs text-white/40">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ATCRadio;
