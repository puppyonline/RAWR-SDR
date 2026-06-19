import { useState, useCallback } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';

function HDRadio() {
  const [frequency, setFrequency] = useState(94.7);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [signalStrength, setSignalStrength] = useState(65);
  const [hdChannel, setHdChannel] = useState(1);
  const [metadata, setMetadata] = useState({
    station: 'WXYZ-HD1',
    artist: 'Unknown Artist',
    title: 'Unknown Track',
    album: '',
    genre: 'Various',
  });

  const handleTune = useCallback((freq: number) => {
    setFrequency(freq);
    setSignalStrength(Math.floor(Math.random() * 40) + 45);
    setMetadata({
      station: `W${freq.toFixed(0)}-HD${hdChannel}`,
      artist: 'Scanning...',
      title: 'Acquiring signal...',
      album: '',
      genre: 'HD Radio',
    });
  }, [hdChannel]);

  return (
    <div className="space-y-4">
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">HD Radio</h2>
            <p className="text-white/50 text-sm">Digital HD Radio - 87.5 - 108.0 MHz</p>
          </div>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isPlaying
                ? 'bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg shadow-violet-500/30'
                : 'glass-button'
            }`}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>

        <div className="text-center mb-4">
          <div className="text-6xl font-bold bg-gradient-to-r from-violet-300 to-purple-300 bg-clip-text text-transparent tabular-nums">
            {frequency.toFixed(1)}
          </div>
          <div className="text-white/40 text-sm mt-1">MHz HD{hdChannel}</div>
        </div>

        {/* HD subchannel selector */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4].map((ch) => (
            <button
              key={ch}
              onClick={() => setHdChannel(ch)}
              className={`glass-button px-4 py-1 text-sm ${
                hdChannel === ch ? 'bg-violet-500/30 border-violet-400/50' : ''
              }`}
            >
              HD{ch}
            </button>
          ))}
        </div>

        <FrequencyDial value={frequency} onChange={handleTune} min={87.5} max={108.0} step={0.2} />
      </div>

      {/* Now Playing metadata */}
      <div className="glass-panel p-6">
        <h3 className="text-sm font-semibold text-white/70 mb-3">Now Playing</h3>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-violet-500/30 to-purple-500/30 flex items-center justify-center text-2xl">
            🎵
          </div>
          <div className="flex-1">
            <div className="font-semibold text-lg">{metadata.title}</div>
            <div className="text-white/60">{metadata.artist}</div>
            <div className="text-white/40 text-sm">{metadata.station} &middot; {metadata.genre}</div>
          </div>
        </div>
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
              className="w-full accent-violet-400"
            />
            <div className="text-center text-sm text-white/50 mt-1">{volume}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HDRadio;
