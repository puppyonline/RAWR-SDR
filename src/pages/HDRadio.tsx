import { useState, useEffect, useRef } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

function HDRadio() {
  const [frequency, setFrequency] = useState(94.7);
  const [hdChannel, setHdChannel] = useState(1);
  const [volume, setVolume] = useState(80);
  const [signalStrength, setSignalStrength] = useState(0);
  const [power, setPower] = useState(false);
  const [metadata, setMetadata] = useState({
    station: '---', artist: '---', title: '---', genre: '---',
  });
  const audio = useAudioStream();
  const tuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTune = useRef(false);

  useEffect(() => { audio.setVolume(volume); }, [volume, audio.setVolume]);

  useEffect(() => {
    if (power && !initialTune.current) {
      initialTune.current = true;
      audio.tune(frequency, 'hd');
      setSignalStrength(Math.floor(Math.random() * 30) + 50);
      setMetadata({ station: `WXYZ-HD${hdChannel}`, artist: 'Decoding...', title: 'HD Stream', genre: 'HD Radio' });
    }
    if (!power) initialTune.current = false;
  }, [power]);

  useEffect(() => {
    if (!power) return;
    if (tuneTimer.current) clearTimeout(tuneTimer.current);
    tuneTimer.current = setTimeout(() => {
      audio.tune(frequency, 'hd');
      setSignalStrength(Math.floor(Math.random() * 30) + 45);
      setMetadata({ station: `HD${hdChannel} ${frequency.toFixed(1)}`, artist: 'Acquiring...', title: 'Decoding...', genre: 'HD Radio' });
    }, 500);
    return () => { if (tuneTimer.current) clearTimeout(tuneTimer.current); };
  }, [frequency]);

  const togglePower = async () => {
    if (power) {
      setPower(false);
      await audio.stop();
      setSignalStrength(0);
      setMetadata({ station: '---', artist: '---', title: '---', genre: '---' });
    } else {
      setPower(true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">HD Radio</h2>
            <p className="text-xs text-white/30 font-mono mt-0.5">87.5 &ndash; 108.0 MHz &middot; NRSC-5</p>
          </div>
          <div className="flex items-center gap-3">
            {audio.error && <span className="text-xs text-danger mr-2">{audio.error}</span>}
            {audio.isConnecting && <span className="text-xs text-white/40 mr-2">Tuning...</span>}
            <button onClick={togglePower} className={power ? 'btn-danger' : 'btn-primary'}>
              {power ? 'Power Off' : 'Power On'}
            </button>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-4">
          <span className="freq-display">{frequency.toFixed(1)}</span>
          <span className="text-sm text-white/30">MHz</span>
          <span className="badge bg-purple-500/10 text-purple-400 border border-purple-500/20 ml-3">HD{hdChannel}</span>
          {power && audio.isPlaying && (
            <div className="flex items-center gap-1.5 ml-3">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-xs text-purple-400/70">Live</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-5">
          {[1, 2, 3, 4].map((ch) => (
            <button
              key={ch}
              onClick={() => setHdChannel(ch)}
              className={`btn-ghost text-xs px-3 ${hdChannel === ch ? 'bg-purple-500/10 border border-purple-500/30 text-purple-300' : ''}`}
            >
              HD{ch}
            </button>
          ))}
        </div>

        <FrequencyDial value={frequency} onChange={(f) => setFrequency(Number(f.toFixed(1)))} min={87.5} max={108.0} step={0.2} color="#a855f7" />

        <div className="flex items-center gap-6 mt-5">
          <div className="flex items-center gap-2">
            <input type="number" min={87.5} max={108.0} step={0.2} value={frequency}
              onChange={(e) => setFrequency(Number(Number(e.target.value).toFixed(1)))}
              className="input w-28 font-mono text-center text-sm" />
            <span className="text-xs text-white/25">MHz</span>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-white/30">Vol</span>
            <input type="range" min="0" max="100" value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1 bg-surface-2 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-purple-400" />
            <span className="text-xs font-mono text-white/30 w-8">{volume}%</span>
          </div>
        </div>
      </div>

      {/* Now playing */}
      <div className="card p-5">
        <span className="label mb-3 block">Now Playing</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(metadata).map(([key, val]) => (
            <div key={key} className="card-inner p-3">
              <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">{key}</p>
              <p className="text-sm font-medium text-white/80 truncate">{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 card p-5">
          <span className="label">Spectrum</span>
          <div className="mt-3"><SpectrumVisualizer isActive={power && audio.isPlaying} color="#a855f7" height={100} /></div>
        </div>
        <div className="card p-5">
          <span className="label">Signal</span>
          <div className="mt-3"><SignalMeter value={signalStrength} color="#a855f7" /></div>
        </div>
      </div>
    </div>
  );
}

export default HDRadio;
