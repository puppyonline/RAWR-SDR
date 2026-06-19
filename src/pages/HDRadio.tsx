import { useState, useCallback, useEffect, useRef } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

function HDRadio() {
  const [frequency, setFrequency] = useState(94.7);
  const [hdChannel, setHdChannel] = useState(1);
  const [volume, setVolumeState] = useState(80);
  const [signalStrength, setSignalStrength] = useState(0);
  const [metadata, setMetadata] = useState({
    station: '---',
    artist: '---',
    title: '---',
    genre: '---',
  });
  const audio = useAudioStream();
  const retuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live retune while playing
  useEffect(() => {
    if (!audio.isPlaying) return;
    if (retuneTimer.current) clearTimeout(retuneTimer.current);
    retuneTimer.current = setTimeout(() => {
      audio.retune(frequency, 'hd');
      setSignalStrength(Math.floor(Math.random() * 30) + 50);
    }, 300);
    return () => { if (retuneTimer.current) clearTimeout(retuneTimer.current); };
  }, [frequency, audio.isPlaying, audio.retune]);

  const handleTune = useCallback((freq: number) => {
    setFrequency(freq);
    setMetadata({
      station: `HD${hdChannel} ${freq.toFixed(1)}`,
      artist: 'Acquiring...',
      title: 'Decoding...',
      genre: 'HD Radio',
    });
  }, [hdChannel]);

  const togglePlay = async () => {
    if (audio.isPlaying) {
      await audio.stop();
      setSignalStrength(0);
      setMetadata({ station: '---', artist: '---', title: '---', genre: '---' });
    } else {
      await audio.start(frequency, 'hd');
      setSignalStrength(Math.floor(Math.random() * 30) + 55);
      setMetadata({
        station: `WXYZ-HD${hdChannel}`,
        artist: 'Various Artists',
        title: 'Digital Audio Stream',
        genre: 'HD Radio',
      });
    }
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">HD Radio</h2>
            <p className="text-xs text-white/30 font-mono mt-0.5">87.5 &ndash; 108.0 MHz &middot; NRSC-5 Digital</p>
          </div>

          <div className="flex items-center gap-3">
            {audio.error && <span className="text-xs text-danger">{audio.error}</span>}
            <button
              onClick={togglePlay}
              disabled={audio.isConnecting}
              className={audio.isPlaying ? 'btn-danger' : 'btn-primary'}
            >
              {audio.isConnecting ? 'Connecting...' : audio.isPlaying ? 'Stop' : 'Play'}
            </button>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-4">
          <span className="freq-display">{frequency.toFixed(1)}</span>
          <span className="text-sm text-white/30">MHz</span>
          <span className="badge bg-purple-500/10 text-purple-400 border border-purple-500/20 ml-3">
            HD{hdChannel}
          </span>
          {audio.isPlaying && (
            <div className="flex items-center gap-1.5 ml-3">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-xs text-purple-400/70">Decoding</span>
            </div>
          )}
        </div>

        {/* HD subchannel selector */}
        <div className="flex gap-2 mb-5">
          {[1, 2, 3, 4].map((ch) => (
            <button
              key={ch}
              onClick={() => setHdChannel(ch)}
              className={`btn-ghost text-xs px-3 ${
                hdChannel === ch ? 'bg-purple-500/10 border border-purple-500/30 text-purple-300' : ''
              }`}
            >
              HD{ch}
            </button>
          ))}
        </div>

        <FrequencyDial value={frequency} onChange={handleTune} min={87.5} max={108.0} step={0.2} color="#a855f7" />
      </div>

      {/* Now playing */}
      <div className="card p-5">
        <span className="label mb-3 block">Now Playing</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetaField label="Station" value={metadata.station} />
          <MetaField label="Title" value={metadata.title} />
          <MetaField label="Artist" value={metadata.artist} />
          <MetaField label="Genre" value={metadata.genre} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 card p-5">
          <span className="label">Spectrum</span>
          <div className="mt-3">
            <SpectrumVisualizer isActive={audio.isPlaying} color="#a855f7" height={130} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <span className="label">Signal</span>
            <div className="mt-3">
              <SignalMeter value={signalStrength} color="#a855f7" />
            </div>
          </div>
          <div className="card p-5">
            <span className="label">Volume</span>
            <div className="mt-3 space-y-2">
              <input
                type="range"
                min="0"
                max="100"
                value={volume}                onChange={(e) => { setVolumeState(Number(e.target.value)); audio.setVolume(Number(e.target.value)); }}
                className="w-full h-1.5 bg-surface-2 rounded-full appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                           [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                           [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-lg"
              />
              <div className="text-center text-xs font-mono text-white/40">{volume}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-inner p-3">
      <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-medium text-white/80 truncate">{value}</p>
    </div>
  );
}

export default HDRadio;
