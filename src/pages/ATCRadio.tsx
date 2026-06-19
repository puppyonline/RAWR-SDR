import { useState, useEffect, useRef } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import { useAudioStream } from '../hooks/useAudioStream';

// Phoenix Sky Harbor (KPHX) and Mesa Gateway (KIWA) ATC frequencies
const presets = [
  // Phoenix Sky Harbor (KPHX)
  { freq: 127.575, label: 'PHX ATIS', desc: 'Sky Harbor ATIS', group: 'KPHX' },
  { freq: 119.200, label: 'PHX Twr W', desc: 'Tower West Ops', group: 'KPHX' },
  { freq: 118.700, label: 'PHX Twr E', desc: 'Tower East Ops', group: 'KPHX' },
  { freq: 132.550, label: 'PHX Gnd N', desc: 'Ground North', group: 'KPHX' },
  { freq: 121.700, label: 'PHX Gnd S', desc: 'Ground South', group: 'KPHX' },
  { freq: 121.250, label: 'PHX Clr', desc: 'Clearance Delivery', group: 'KPHX' },
  { freq: 124.100, label: 'PHX App N', desc: 'Approach North', group: 'KPHX' },
  { freq: 126.100, label: 'PHX App S', desc: 'Approach South', group: 'KPHX' },
  { freq: 120.700, label: 'PHX App W', desc: 'Approach West', group: 'KPHX' },
  { freq: 125.100, label: 'PHX Dep', desc: 'Departure', group: 'KPHX' },
  { freq: 123.700, label: 'PHX Dep E', desc: 'Departure East', group: 'KPHX' },

  // Mesa Gateway (KIWA)
  { freq: 133.500, label: 'IWA ATIS', desc: 'Gateway ATIS/AWOS', group: 'KIWA' },
  { freq: 120.600, label: 'IWA Twr', desc: 'Gateway Tower', group: 'KIWA' },
  { freq: 121.800, label: 'IWA Gnd', desc: 'Gateway Ground', group: 'KIWA' },
  { freq: 124.900, label: 'IWA App', desc: 'Gateway Approach', group: 'KIWA' },

  // Scottsdale (KSDL)
  { freq: 125.600, label: 'SDL ATIS', desc: 'Scottsdale ATIS', group: 'KSDL' },
  { freq: 119.900, label: 'SDL Twr', desc: 'Scottsdale Tower', group: 'KSDL' },

  // Deer Valley (KDVT)
  { freq: 128.025, label: 'DVT ATIS', desc: 'Deer Valley ATIS', group: 'KDVT' },
  { freq: 118.400, label: 'DVT Twr', desc: 'Deer Valley Tower', group: 'KDVT' },

  // Other
  { freq: 121.500, label: 'GUARD', desc: 'Emergency/Guard', group: 'EMRG' },
  { freq: 122.750, label: 'UNICOM', desc: 'General Aviation', group: 'OTHER' },
  { freq: 122.950, label: 'MULTICOM', desc: 'Uncontrolled', group: 'OTHER' },
  { freq: 123.450, label: 'AIR-AIR', desc: 'Pilot to Pilot', group: 'OTHER' },
  { freq: 135.400, label: 'ABQ Ctr', desc: 'Albuquerque Center', group: 'ARTCC' },
  { freq: 132.150, label: 'LA Ctr', desc: 'LA Center (West)', group: 'ARTCC' },
];

function ATCRadio() {
  const [frequency, setFrequency] = useState(119.2);
  const [squelch, setSquelch] = useState(50);
  const [volume, setVolume] = useState(80);
  const [power, setPower] = useState(false);
  const audio = useAudioStream();
  const tuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTune = useRef(false);

  useEffect(() => { audio.setVolume(volume); }, [volume, audio.setVolume]);

  useEffect(() => {
    if (power && !initialTune.current) {
      initialTune.current = true;
      audio.tune(frequency, 'atc');
    }
    if (!power) initialTune.current = false;
  }, [power]);

  useEffect(() => {
    if (!power) return;
    if (tuneTimer.current) clearTimeout(tuneTimer.current);
    tuneTimer.current = setTimeout(() => {
      audio.tune(frequency, 'atc');
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

  // Group presets by airport
  const groups = [...new Set(presets.map((p) => p.group))];

  return (
    <div className="space-y-3">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Air Traffic Control</h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              118.000 &ndash; 136.975 MHz &middot; Phoenix Terminal Area
            </p>
          </div>
          <div className="flex items-center gap-3">
            {audio.error && <span className="text-xs text-danger mr-2">{audio.error}</span>}
            {audio.isConnecting && <span className="text-xs text-zinc-500">Tuning...</span>}
            <button onClick={togglePower} className={power ? 'btn-danger btn-sm' : 'btn-brand btn-sm'}>
              {power ? 'Power Off' : 'Power On'}
            </button>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-6">
          <span className="freq-display">{frequency.toFixed(3)}</span>
          <span className="text-sm text-zinc-500">MHz</span>
          {power && audio.isPlaying && (
            <div className="flex items-center gap-1.5 ml-4">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs text-cyan-400/70">Monitoring</span>
            </div>
          )}
        </div>

        <FrequencyDial value={frequency} onChange={(f) => setFrequency(Number(f.toFixed(3)))} min={118.0} max={137.0} step={0.025} color="#22d3ee" />

        <div className="flex items-center gap-6 mt-5">
          <div className="flex items-center gap-2">
            <input type="number" min={118.0} max={137.0} step={0.025} value={frequency}
              onChange={(e) => setFrequency(Number(Number(e.target.value).toFixed(3)))}
              className="input w-32 font-mono text-center text-sm" />
            <span className="text-xs text-zinc-100/25">MHz</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">Squelch</span>
            <input type="range" min="0" max="200" value={squelch}
              onChange={(e) => setSquelch(Number(e.target.value))}
              className="w-24 h-1 bg-bg-raised rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-cyan-400" />
            <span className="text-xs font-mono text-zinc-500 w-6">{squelch}</span>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-zinc-500">Vol</span>
            <input type="range" min="0" max="100" value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1 bg-bg-raised rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-cyan-400" />
            <span className="text-xs font-mono text-zinc-500 w-8">{volume}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 card p-5">
          <span className="label">Spectrum</span>
          <div className="mt-3"><SpectrumVisualizer getFrequencyData={audio.getFrequencyData} isActive={power && audio.isPlaying} color="#22d3ee" height={100} /></div>
        </div>
        <div className="card p-5">
          <span className="label">Signal</span>
          <div className="mt-3"><SignalMeter getSignalLevel={audio.getSignalLevel} isActive={power && audio.isPlaying} color="#22d3ee" /></div>
        </div>
      </div>

      {/* Grouped presets by airport */}
      {groups.map((group) => (
        <div key={group} className="card p-5">
          <span className="label">{group}</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-3">
            {presets.filter((p) => p.group === group).map((f) => (
              <button
                key={f.freq}
                onClick={() => setFrequency(f.freq)}
                className={`card-inner p-2.5 text-left transition-all hover:border-white/10 ${
                  frequency === f.freq ? 'border-cyan-500/30 bg-cyan-500/5' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] uppercase text-zinc-500 font-medium truncate">{f.label}</span>
                  {f.freq === 121.5 && <span className="badge-danger text-[8px]">EMRG</span>}
                </div>
                <div className="text-sm font-mono font-medium">{f.freq.toFixed(3)}</div>
                <div className="text-[9px] text-zinc-100/20 mt-0.5 truncate">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ATCRadio;
