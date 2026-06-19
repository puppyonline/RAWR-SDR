import { useState, useEffect, useRef } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

const presets = [
  { freq: 89.5, label: 'KBAQ', format: 'Classical' },
  { freq: 91.5, label: 'KJZZ', format: 'Public/Jazz' },
  { freq: 92.3, label: 'KTAR', format: 'News/Talk' },
  { freq: 93.3, label: 'KDKB', format: 'Alternative' },
  { freq: 94.5, label: 'KOOL', format: 'Classic Hits' },
  { freq: 95.5, label: 'KYOT', format: 'Adult Hits' },
  { freq: 96.9, label: 'KMXP', format: 'Hot AC' },
  { freq: 97.9, label: 'KUPD', format: 'Rock' },
  { freq: 98.7, label: 'KNRJ', format: 'Regional Mex' },
  { freq: 99.9, label: 'KESZ', format: 'Adult Contemp' },
  { freq: 100.3, label: 'KSLX', format: 'Classic Rock' },
  { freq: 100.7, label: 'KNIX', format: 'Country' },
  { freq: 101.5, label: 'KZON', format: 'Alt Rock' },
  { freq: 102.5, label: 'KNIX', format: 'Country' },
  { freq: 103.9, label: 'KEDJ', format: 'Rhythmic' },
  { freq: 104.7, label: 'KFYI', format: 'Talk' },
  { freq: 106.9, label: 'KDVA', format: 'Top 40' },
  { freq: 107.9, label: 'KMLE', format: 'Country' },
];

function FMRadio() {
  const [frequency, setFrequency] = useState(100.7);
  const [volume, setVolume] = useState(80);
  const [power, setPower] = useState(false);
  const [rds, setRDS] = useState<Record<string, any>>({});
  const audio = useAudioStream();
  const tuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTune = useRef(false);

  useEffect(() => { audio.setVolume(volume); }, [volume, audio.setVolume]);

  useEffect(() => {
    audio.onRDS((data) => setRDS({ ...data }));
  }, [audio.onRDS]);

  useEffect(() => {
    if (power && !initialTune.current) {
      initialTune.current = true;
      setRDS({});
      audio.tune(frequency, 'fm');
    }
    if (!power) initialTune.current = false;
  }, [power]);

  useEffect(() => {
    if (!power) return;
    if (tuneTimer.current) clearTimeout(tuneTimer.current);
    tuneTimer.current = setTimeout(() => {
      setRDS({});
      audio.tune(frequency, 'fm');
    }, 500);
    return () => { if (tuneTimer.current) clearTimeout(tuneTimer.current); };
  }, [frequency]);

  const togglePower = async () => {
    if (power) {
      setPower(false);
      await audio.stop();
    } else {
      setPower(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Player card */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="section-title">FM Broadcast</h2>
            <p className="section-subtitle mt-0.5">87.5 &ndash; 108.0 MHz &middot; Wideband FM</p>
          </div>
          <div className="flex items-center gap-3">
            {audio.error && <span className="text-xs text-danger">{audio.error}</span>}
            {audio.isConnecting && <span className="text-xs text-zinc-500">Tuning...</span>}
            <button onClick={togglePower} className={power ? 'btn-danger btn-sm' : 'btn-brand btn-sm'}>
              {power ? 'Power Off' : 'Power On'}
            </button>
          </div>
        </div>

        {/* Frequency + status */}
        <div className="flex items-baseline gap-3 mb-5">
          <span className="freq-display">{frequency.toFixed(1)}</span>
          <span className="text-sm text-zinc-500">MHz</span>
          {power && audio.isPlaying && (
            <span className="badge-live ml-3">LIVE</span>
          )}
        </div>

        {/* Tuner */}
        <FrequencyDial value={frequency} onChange={(f) => setFrequency(Number(f.toFixed(1)))} min={87.5} max={108.0} step={0.1} color="#8b5cf6" />

        {/* Controls row */}
        <div className="flex items-center gap-5 mt-4">
          <div className="flex items-center gap-2">
            <input type="number" min={87.5} max={108.0} step={0.1} value={frequency}
              onChange={(e) => setFrequency(Number(Number(e.target.value).toFixed(1)))}
              className="input w-24 font-mono text-center text-sm" />
            <span className="text-xs text-zinc-500">MHz</span>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-zinc-500">Vol</span>
            <input type="range" min="0" max="100" value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1 bg-bg-raised rounded-full appearance-none cursor-pointer accent-radio" />
            <span className="text-xs font-mono text-zinc-500 w-8">{volume}%</span>
          </div>
        </div>
      </div>

      {/* RDS */}
      {power && Object.keys(rds).length > 0 && (
        <div className="card p-4">
          <span className="label text-radio">RDS Data</span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            {rds.ps && <MetaChip label="Station" value={rds.ps} />}
            {rds.radiotext && <MetaChip label="Radio Text" value={rds.radiotext} span={2} />}
            {rds.prog_type && <MetaChip label="Genre" value={rds.prog_type} />}
            {rds.artist && <MetaChip label="Artist" value={rds.artist} />}
            {rds.title && <MetaChip label="Title" value={rds.title} />}
          </div>
        </div>
      )}

      {/* Meters */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-3 card p-4">
          <span className="label">Spectrum</span>
          <div className="mt-2">
            <SpectrumVisualizer getFrequencyData={audio.getFrequencyData} isActive={power && audio.isPlaying} color="#8b5cf6" height={90} />
          </div>
        </div>
        <div className="card p-4">
          <span className="label">Signal</span>
          <div className="mt-2">
            <SignalMeter getSignalLevel={audio.getSignalLevel} isActive={power && audio.isPlaying} color="#8b5cf6" />
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="card p-4">
        <span className="label text-radio">Mesa / Phoenix Presets</span>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 mt-2">
          {presets.map((p) => (
            <button
              key={p.freq}
              onClick={() => setFrequency(p.freq)}
              className={`card-inner py-2 px-1.5 text-center transition-all hover:border-radio/30 ${
                frequency === p.freq ? 'border-radio/40 bg-radio/5' : ''
              }`}
            >
              <div className="text-2xs text-zinc-500 truncate">{p.label}</div>
              <div className="text-xs font-mono font-medium text-zinc-200">{p.freq}</div>
              <div className="text-2xs text-zinc-600 truncate">{p.format}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaChip({ label, value, span }: { label: string; value: string; span?: number }) {
  return (
    <div className={`card-inner p-2 ${span === 2 ? 'md:col-span-2' : ''}`}>
      <p className="text-2xs text-zinc-500 uppercase">{label}</p>
      <p className="text-xs text-zinc-200 truncate mt-0.5">{value}</p>
    </div>
  );
}

export default FMRadio;
