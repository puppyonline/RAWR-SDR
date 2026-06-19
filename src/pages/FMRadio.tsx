import { useState, useEffect, useRef } from 'react';
import FrequencyDial from '../components/FrequencyDial';
import SpectrumVisualizer from '../components/SpectrumVisualizer';
import SignalMeter from '../components/SignalMeter';
import StationLogo from '../components/StationLogo';
import { useAudioStream } from '../hooks/useAudioStream';
import { useNowPlayingMeta } from '../hooks/useMetadata';

interface StationPreset {
  freq: number;
  label: string;
  format: string;
  slogan?: string;
  owner?: string;
  city?: string;
  website?: string;
  power?: string;
}

const presets: StationPreset[] = [
  { freq: 89.5, label: 'KBAQ', format: 'Classical', slogan: 'Classical Music for Arizona', owner: 'Arizona State University', city: 'Phoenix, AZ', power: '100 kW', website: 'kbaq.org' },
  { freq: 91.5, label: 'KJZZ', format: 'Public/Jazz', slogan: "Arizona's NPR Station", owner: 'Maricopa Community Colleges', city: 'Phoenix, AZ', power: '100 kW', website: 'kjzz.org' },
  { freq: 92.3, label: 'KTAR', format: 'News/Talk', slogan: 'Arizona News & Talk', owner: 'Bonneville International', city: 'Glendale, AZ', power: '97 kW', website: 'ktar.com' },
  { freq: 93.3, label: 'KDKB', format: 'Alternative', slogan: '93.3 ALT AZ', owner: 'Riviera Broadcasting', city: 'Mesa, AZ', power: '100 kW', website: 'alt933.com' },
  { freq: 94.5, label: 'KOOL', format: 'Classic Hits', slogan: "Arizona's Classic Hits", owner: 'iHeartMedia', city: 'Phoenix, AZ', power: '97 kW', website: 'kfrq.com' },
  { freq: 95.5, label: 'KYOT', format: 'Adult Hits', slogan: 'The Coyote', owner: 'CBS Radio', city: 'Phoenix, AZ', power: '99 kW' },
  { freq: 96.9, label: 'KMXP', format: 'Hot AC', slogan: 'Mix 96.9', owner: 'Hubbard Broadcasting', city: 'Phoenix, AZ', power: '100 kW' },
  { freq: 97.9, label: 'KUPD', format: 'Rock', slogan: 'Real Rock Radio', owner: 'Riviera Broadcasting', city: 'Tempe, AZ', power: '100 kW', website: 'kupd.com' },
  { freq: 98.7, label: 'KNRJ', format: 'Regional Mex', city: 'Phoenix, AZ', power: '28 kW' },
  { freq: 99.9, label: 'KESZ', format: 'Adult Contemp', slogan: 'More Music, Less Talk', owner: 'iHeartMedia', city: 'Phoenix, AZ', power: '100 kW' },
  { freq: 100.3, label: 'KSLX', format: 'Classic Rock', slogan: 'Arizona Classic Rock', owner: 'Bonneville International', city: 'Scottsdale, AZ', power: '100 kW', website: 'kslx.com' },
  { freq: 100.7, label: 'KNIX', format: 'Country', slogan: "Arizona's #1 for New Country", owner: 'iHeartMedia', city: 'Phoenix, AZ', power: '100 kW', website: 'knix.com' },
  { freq: 101.5, label: 'KZON', format: 'Alt Rock', slogan: 'The Zone', owner: 'Bonneville International', city: 'Phoenix, AZ', power: '100 kW' },
  { freq: 102.5, label: 'KNIX', format: 'Country', city: 'Tolleson, AZ', power: '50 kW' },
  { freq: 103.9, label: 'KEDJ', format: 'Rhythmic', slogan: 'The Edge', owner: 'iHeartMedia', city: 'Sun City, AZ', power: '100 kW' },
  { freq: 104.7, label: 'KFYI', format: 'Talk', slogan: 'News Talk 104.7', owner: 'iHeartMedia', city: 'Phoenix, AZ', power: '100 kW' },
  { freq: 106.9, label: 'KDVA', format: 'Top 40', city: 'Buckeye, AZ', power: '3.6 kW' },
  { freq: 107.9, label: 'KMLE', format: 'Country', slogan: 'Country Music for Arizona', owner: 'Riviera Broadcasting', city: 'Chandler, AZ', power: '100 kW', website: 'kmle.com' },
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
            {audio.isConnecting && <span className="text-xs text-muted">Tuning...</span>}
            <button onClick={togglePower} className={power ? 'btn-danger btn-sm' : 'btn-brand btn-sm'}>
              {power ? 'Power Off' : 'Power On'}
            </button>
          </div>
        </div>

        {/* Frequency + status */}
        <div className="flex items-baseline gap-3 mb-5">
          <span className="freq-display">{frequency.toFixed(1)}</span>
          <span className="text-sm text-muted">MHz</span>
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
            <span className="text-xs text-muted">MHz</span>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-muted">Vol</span>
            <input type="range" min="0" max="100" value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1 bg-raised rounded-full appearance-none cursor-pointer accent-radio" />
            <span className="text-xs font-mono text-muted w-8">{volume}%</span>
          </div>
        </div>
      </div>

      {/* Now Playing + Station Info (combined panel) */}
      {power && (
        <NowPlayingPanel
          frequency={frequency}
          preset={presets.find(p => p.freq === frequency)}
          rds={rds}
          isPlaying={audio.isPlaying}
        />
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 mt-2">
          {presets.map((p) => (
            <button
              key={p.freq}
              onClick={() => setFrequency(p.freq)}
              className={`card-inner py-2 px-2 text-left transition-all hover:border-radio/30 flex items-center gap-2 ${
                frequency === p.freq ? 'border-radio/40 bg-radio/5' : ''
              }`}
            >
              <StationLogo callsign={p.label} size={28} fallbackColor="#8b5cf6" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-secondary truncate">{p.label}</div>
                <div className="text-2xs text-muted">{p.freq} &middot; {p.format}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NowPlayingPanel({ frequency, preset, rds, isPlaying }: {
  frequency: number;
  preset?: StationPreset;
  rds: Record<string, any>;
  isPlaying: boolean;
}) {
  const hasRDS = Object.keys(rds).length > 0;
  const hasTrack = rds.artist || rds.title;

  // Fetch rich metadata when we have artist/title from RDS
  const meta = useNowPlayingMeta(
    rds.artist || undefined,
    rds.title || undefined,
    preset?.label || undefined
  );

  const albumArt = meta?.track?.albumArtLarge || meta?.track?.albumArt;

  return (
    <div className="card p-0 overflow-hidden">
      {/* Now Playing header */}
      <div className="p-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <StationLogo callsign={preset?.label || ''} size={44} fallbackColor="#8b5cf6" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-primary">
                {preset?.label || `${frequency.toFixed(1)} FM`}
              </h3>
              {isPlaying && (
                <div className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-radio animate-pulse" />
                  <span className="text-2xs text-radio">ON AIR</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted">
              {frequency.toFixed(1)} MHz &middot; {preset?.format || 'FM Broadcast'}
              {preset?.slogan && <span className="text-faint"> &mdash; {preset.slogan}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Currently playing track with album art */}
      {hasRDS && (
        <div className="p-4 bg-radio/[0.02] border-b border-white/[0.04]">
          {hasTrack ? (
            <div className="flex items-start gap-3">
              {/* Album art or fallback icon */}
              {albumArt ? (
                <img
                  src={albumArt}
                  alt={meta?.track?.album || 'Album art'}
                  className="w-14 h-14 rounded-lg object-cover shrink-0 shadow-lg"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-radio/10 border border-radio/20 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-radio">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-2xs text-muted uppercase tracking-wide">Now Playing</p>
                <p className="text-sm font-medium text-primary mt-0.5 truncate">{rds.title || 'Unknown Track'}</p>
                {rds.artist && <p className="text-xs text-muted mt-0.5 truncate">{rds.artist}</p>}
                {/* Album + genre from iTunes */}
                {meta?.track && (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {meta.track.album && (
                      <span className="text-2xs text-muted truncate max-w-[12rem]">
                        {meta.track.album}
                      </span>
                    )}
                    {meta.track.genre && (
                      <span className="badge bg-radio/10 text-radio text-2xs border border-radio/20">
                        {meta.track.genre}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {rds.prog_type && !meta?.track?.genre && (
                <span className="badge bg-radio/10 text-radio text-2xs border border-radio/20 shrink-0">
                  {rds.prog_type}
                </span>
              )}
            </div>
          ) : rds.radiotext ? (
            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-1">Radio Text</p>
              <p className="text-sm text-secondary">{rds.radiotext}</p>
            </div>
          ) : rds.ps ? (
            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-1">Station ID</p>
              <p className="text-sm text-secondary font-medium">{rds.ps}</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Artist info from MusicBrainz + Wikipedia */}
      {meta?.artistWiki && hasTrack && (
        <div className="p-4 border-b border-white/[0.04]">
          <div className="flex items-start gap-3">
            {meta.artistWiki.thumbnail && (
              <img
                src={meta.artistWiki.thumbnail}
                alt={meta.artistWiki.title}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-secondary">{meta.artistWiki.title}</p>
                {meta.artist?.country && (
                  <span className="text-2xs text-muted">{meta.artist.country}</span>
                )}
              </div>
              <p className="text-2xs text-muted mt-1 line-clamp-2 leading-relaxed">
                {meta.artistWiki.extract}
              </p>
              {meta.artist?.genres && meta.artist.genres.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {meta.artist.genres.slice(0, 4).map((g) => (
                    <span key={g} className="text-2xs text-muted bg-white/[0.04] rounded px-1.5 py-0.5">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Station Wikipedia blurb (when no track is playing) */}
      {meta?.stationWiki && !hasTrack && (
        <div className="p-4 border-b border-white/[0.04]">
          <p className="text-2xs text-muted uppercase tracking-wide mb-1">About this station</p>
          <p className="text-xs text-muted line-clamp-3 leading-relaxed">
            {meta.stationWiki.extract}
          </p>
        </div>
      )}

      {/* Station details grid */}
      {preset && (
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {preset.city && (
              <div>
                <p className="text-2xs text-faint uppercase tracking-wide">City</p>
                <p className="text-xs text-secondary mt-0.5">{preset.city}</p>
              </div>
            )}
            {preset.owner && (
              <div>
                <p className="text-2xs text-faint uppercase tracking-wide">Owner</p>
                <p className="text-xs text-secondary mt-0.5 truncate">{preset.owner}</p>
              </div>
            )}
            {preset.power && (
              <div>
                <p className="text-2xs text-faint uppercase tracking-wide">Power</p>
                <p className="text-xs text-secondary mt-0.5">{preset.power}</p>
              </div>
            )}
            {preset.website && (
              <div>
                <p className="text-2xs text-faint uppercase tracking-wide">Website</p>
                <a
                  href={`https://${preset.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-bright hover:underline mt-0.5 block truncate"
                >
                  {preset.website}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RDS raw data (if we have additional fields beyond what's shown above) */}
      {hasRDS && (rds.pi || rds.pty || rds.tp) && (
        <div className="px-4 pb-3 pt-0">
          <div className="flex items-center gap-3 text-2xs text-faint">
            {rds.pi && <span>PI: {rds.pi}</span>}
            {rds.pty && <span>PTY: {rds.pty}</span>}
            {rds.tp && <span>TP: {rds.tp}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaChip({ label, value, span }: { label: string; value: string; span?: number }) {
  return (
    <div className={`card-inner p-2 ${span === 2 ? 'md:col-span-2' : ''}`}>
      <p className="text-2xs text-muted uppercase">{label}</p>
      <p className="text-xs text-secondary truncate mt-0.5">{value}</p>
    </div>
  );
}

export default FMRadio;
