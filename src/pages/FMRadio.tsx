import { useState, useEffect, useRef } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

// Phoenix/Mesa AZ metro FM stations
const presets = [
  { freq: 89.5, label: 'KBAQ', format: 'Classical' },
  { freq: 91.5, label: 'KJZZ', format: 'Public/Jazz' },
  { freq: 92.3, label: 'KTAR', format: 'News/Talk' },
  { freq: 92.7, label: 'KAZG', format: 'Oldies' },
  { freq: 93.3, label: 'KDKB', format: 'Alternative' },
  { freq: 93.9, label: 'KFYI', format: 'Talk' },
  { freq: 94.5, label: 'KOOL', format: 'Classic Hits' },
  { freq: 95.5, label: 'KYOT', format: 'Adult Hits' },
  { freq: 96.9, label: 'KMXP', format: 'Hot AC' },
  { freq: 97.5, label: 'KBPA', format: 'Soft AC' },
  { freq: 97.9, label: 'KUPD', format: 'Rock' },
  { freq: 98.3, label: 'KKFR', format: 'Hip-Hop/R&B' },
  { freq: 98.7, label: 'KNRJ', format: 'Regional Mex' },
  { freq: 99.9, label: 'KESZ', format: 'Adult Contemp' },
  { freq: 100.3, label: 'KSLX', format: 'Classic Rock' },
  { freq: 100.7, label: 'KNIX', format: 'Country' },
  { freq: 101.5, label: 'KZON', format: 'Alt Rock' },
  { freq: 102.5, label: 'KNIX', format: 'Country' },
  { freq: 103.5, label: 'KVIB', format: 'Latin' },
  { freq: 103.9, label: 'KDUS', format: 'Rhythmic' },
  { freq: 104.7, label: 'KFYI', format: 'Talk' },
  { freq: 105.1, label: 'KKLT', format: 'Christian' },
  { freq: 106.3, label: 'KKVV', format: 'Variety' },
  { freq: 106.9, label: 'KDVA', format: 'Top 40' },
  { freq: 107.5, label: 'KVVA', format: 'Regional Mex' },
  { freq: 107.9, label: 'KMLE', format: 'Country' },
];

function FMRadio() {
  const [frequency, setFrequency] = useState(100.7);
  const [volume, setVolume] = useState(80);
  const [signalStrength, setSignalStrength] = useState(0);
  const [power, setPower] = useState(false);
  const [rds, setRDS] = useState<Record<string, any>>({});
  const audio = useAudioStream();
  const tuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTune = useRef(false);

  useEffect(() => { audio.setVolume(volume); }, [volume, audio.setVolume]);

  // Listen for RDS updates
  useEffect(() => {
    audio.onRDS((data) => setRDS({ ...data }));
  }, [audio.onRDS]);

  useEffect(() => {
    if (power && !initialTune.current) {
      initialTune.current = true;
      setRDS({});
      audio.tune(frequency, 'fm');
      setSignalStrength(Math.floor(Math.random() * 30) + 60);
    }
    if (!power) initialTune.current = false;
  }, [power]);

  useEffect(() => {
    if (!power) return;
    if (tuneTimer.current) clearTimeout(tuneTimer.current);
    tuneTimer.current = setTimeout(() => {
      setRDS({});
      audio.tune(frequency, 'fm');
      setSignalStrength(Math.floor(Math.random() * 30) + 55);
    }, 500);
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
    <div className="space-y-3">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">FM Broadcast</h2>
            <p className="text-xs text-white/30 font-mono mt-0.5">
              87.5 &ndash; 108.0 MHz &middot; Phoenix/Mesa AZ
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
            <input type="number" min={87.5} max={108.0} step={0.1} value={frequency}
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
                         [&::-webkit-slider-thumb]:bg-accent" />
            <span className="text-xs font-mono text-white/30 w-8">{volume}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 card p-5">
          <span className="label">Spectrum</span>
          <div className="mt-3"><SpectrumVisualizer isActive={power && audio.isPlaying} color="#6366f1" height={100} /></div>
        </div>
        <div className="card p-5">
          <span className="label">Signal</span>
          <div className="mt-3"><SignalMeter value={signalStrength} /></div>
        </div>
      </div>

      {/* RDS Data */}
      {power && Object.keys(rds).length > 0 && (
        <div className="card p-5">
          <span className="label">RDS Data</span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {rds.ps && (
              <div className="card-inner p-3">
                <p className="text-[10px] text-white/30 uppercase mb-1">Station</p>
                <p className="text-sm font-mono font-semibold text-white/90">{rds.ps}</p>
              </div>
            )}
            {rds.radiotext && (
              <div className="card-inner p-3 md:col-span-2">
                <p className="text-[10px] text-white/30 uppercase mb-1">Radio Text</p>
                <p className="text-sm text-white/80 truncate">{rds.radiotext}</p>
              </div>
            )}
            {rds.prog_type && (
              <div className="card-inner p-3">
                <p className="text-[10px] text-white/30 uppercase mb-1">Genre</p>
                <p className="text-sm text-white/70">{rds.prog_type}</p>
              </div>
            )}
            {rds.artist && (
              <div className="card-inner p-3">
                <p className="text-[10px] text-white/30 uppercase mb-1">Artist</p>
                <p className="text-sm text-white/80 truncate">{rds.artist}</p>
              </div>
            )}
            {rds.title && (
              <div className="card-inner p-3">
                <p className="text-[10px] text-white/30 uppercase mb-1">Title</p>
                <p className="text-sm text-white/80 truncate">{rds.title}</p>
              </div>
            )}
            {rds.pi && (
              <div className="card-inner p-3">
                <p className="text-[10px] text-white/30 uppercase mb-1">PI Code</p>
                <p className="text-xs font-mono text-white/50">{rds.pi}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card p-5">
        <span className="label">Phoenix/Mesa Presets</span>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 mt-3">
          {presets.map((p) => (
            <button
              key={p.freq}
              onClick={() => setFrequency(p.freq)}
              className={`card-inner py-2.5 px-2 text-center transition-all hover:border-white/10 ${
                frequency === p.freq ? 'border-accent/30 bg-accent/5' : ''
              }`}
            >
              <div className="text-[10px] text-white/30 mb-0.5 truncate">{p.label}</div>
              <div className="text-xs font-mono font-medium">{p.freq}</div>
              <div className="text-[9px] text-white/20 mt-0.5 truncate">{p.format}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FMRadio;
