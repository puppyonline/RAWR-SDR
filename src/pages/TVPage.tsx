import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { tvNetworkLogos, getTVStationLogo } from '../hooks/useStationLogos';
import { useTVShowInfo } from '../hooks/useMetadata';
import { useTVPlayer, getTVVideoElement } from '../hooks/useTVPlayer';
import type { TVChannel } from '../hooks/useTVPlayer';

interface Channel {
  GuideNumber: string;
  GuideName: string;
  URL: string;
  Tags?: string;
}

interface GuideEntry {
  Title: string;
  EpisodeTitle?: string;
  StartTime: number;
  EndTime: number;
  Synopsis?: string;
}

interface GuideChannel {
  GuideNumber: string;
  GuideName: string;
  Guide?: GuideEntry[];
}

// Phoenix OTA channel metadata
const channelMeta: Record<string, { network: string; color: string; logo?: string }> = {
  '3': { network: 'IND', color: '#6366f1' },
  '5': { network: 'CBS', color: '#2563eb', logo: tvNetworkLogos['CBS'] },
  '7': { network: 'CW', color: '#16a34a', logo: tvNetworkLogos['CW'] },
  '8': { network: 'PBS', color: '#0891b2', logo: tvNetworkLogos['PBS'] },
  '10': { network: 'NBC', color: '#f59e0b', logo: tvNetworkLogos['NBC'] },
  '12': { network: 'NBC', color: '#f59e0b', logo: tvNetworkLogos['NBC'] },
  '15': { network: 'ABC', color: '#000000', logo: tvNetworkLogos['ABC'] },
  '33': { network: 'FOX', color: '#1d4ed8', logo: tvNetworkLogos['FOX'] },
  '45': { network: 'Uni', color: '#dc2626', logo: tvNetworkLogos['Univision'] },
  '61': { network: 'IND', color: '#6366f1' },
};

function TVPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [guide, setGuide] = useState<GuideChannel[]>([]);
  const [hdhrStatus, setHdhrStatus] = useState<any>(null);
  const [localError, setLocalError] = useState('');
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const { state, tuneChannel, stopPlayback } = useTVPlayer();
  const { selectedChannel, isPlaying, isBuffering, error, loadingBlurb } = state;

  // Move the shared video element into our container
  useEffect(() => {
    const grabVideo = () => {
      const video = getTVVideoElement();
      const container = videoContainerRef.current;
      if (video && container && video.parentElement !== container) {
        video.className = 'w-full h-full';
        container.appendChild(video);
      }
    };
    grabVideo();
    // Retry after a short delay in case of race conditions
    const timer = setTimeout(grabVideo, 100);
    return () => {
      clearTimeout(timer);
      // Move video back to the provider root
      const video = getTVVideoElement() || videoContainerRef.current?.querySelector('video');
      const root = document.getElementById('tv-player-root');
      if (video && root && video.parentElement !== root) {
        video.className = 'w-full h-full object-cover';
        root.appendChild(video);
      }
    };
  }, []);

  // Fetch lineup and status
  useEffect(() => {
    const init = async () => {
      await new Promise((r) => setTimeout(r, 300));
      await fetchStatus();
      await fetchLineup();
      fetchGuide();
    };
    init();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/hdhr/status');
      const data = await res.json();
      setHdhrStatus(data);
      if (!data?.connected) {
        setTimeout(async () => {
          const retry = await fetch('/api/hdhr/status');
          const d = await retry.json();
          setHdhrStatus(d);
        }, 2000);
      }
    } catch { setHdhrStatus(null); }
  };

  const fetchLineup = async () => {
    try {
      const res = await fetch('/api/hdhr/lineup');
      if (!res.ok) throw new Error('Failed to get lineup');
      const data = await res.json();
      const filtered = data.filter((ch: any) => {
        if (parseFloat(ch.GuideNumber) >= 100) return false;
        if (ch.DRM) return false;
        return true;
      });
      setChannels(filtered);
    } catch (err: any) {
      setLocalError(err.message);
    }
  };

  const fetchGuide = async () => {
    try {
      const res = await fetch('/api/hdhr/guide');
      if (!res.ok) return;
      setGuide(await res.json());
    } catch {}
  };

  const getCurrentProgram = (guideNumber: string): GuideEntry | null => {
    const now = Math.floor(Date.now() / 1000);
    const ch = guide.find((g) => g.GuideNumber === guideNumber);
    return ch?.Guide?.find((p) => p.StartTime <= now && p.EndTime > now) || null;
  };

  const handleTune = (ch: Channel) => {
    tuneChannel({ GuideNumber: ch.GuideNumber, GuideName: ch.GuideName });
  };

  const displayError = error || localError;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Live TV</h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">HDHomeRun Flex 4K &middot; OTA Broadcast</p>
          </div>
          <div className="flex items-center gap-3">
            {displayError && <span className="text-xs text-danger">{displayError}</span>}
            <Link to="/guide" className="btn-ghost btn-sm">TV Guide</Link>
            <span className={`badge ${hdhrStatus?.connected ? 'badge-live' : hdhrStatus === null ? 'badge-brand' : 'bg-danger/10 text-danger border border-danger/20'}`}>
              {hdhrStatus?.connected ? 'Connected' : hdhrStatus === null ? 'Connecting...' : 'No Device'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Video Player with Overlay */}
        <div className="lg:col-span-2 card p-0 overflow-hidden flex flex-col">
          <VideoPlayerOverlay
            videoContainerRef={videoContainerRef}
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            selectedChannel={selectedChannel}
            guide={guide}
            channelMeta={channelMeta}
            loadingBlurb={loadingBlurb}
            onStop={stopPlayback}
          />
        </div>

        {/* Channel List */}
        <div className="relative max-h-[28rem] lg:max-h-none">
          <div className="lg:absolute lg:inset-0 card p-0 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-white/[0.06] bg-bg-card z-10 shrink-0">
              <span className="label">Channels ({channels.length})</span>
            </div>
            <div className="divide-y divide-white/[0.04] overflow-y-auto flex-1 min-h-0">
              {channels.map((ch) => {
                const program = getCurrentProgram(ch.GuideNumber);
                const meta = channelMeta[ch.GuideNumber.split('.')[0]];
                const isActive = selectedChannel?.GuideNumber === ch.GuideNumber;

                return (
                  <button
                    key={ch.GuideNumber}
                    onClick={() => handleTune(ch)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-white/[0.03] transition-colors ${
                      isActive ? 'bg-brand/5 border-l-2 border-brand' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {(() => {
                        const logoUrl = meta?.logo || getTVStationLogo(ch.GuideName);
                        if (logoUrl) return <img src={logoUrl} alt="" className="w-6 h-6 object-contain rounded-sm shrink-0" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
                        if (meta) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0" style={{ backgroundColor: `${meta.color}30`, color: meta.color }}>{meta.network}</span>;
                        return <div className="w-6 h-6 rounded-sm bg-bg-raised shrink-0" />;
                      })()}
                      <span className="text-xs font-mono text-zinc-400 w-8">{ch.GuideNumber}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{ch.GuideName}</div>
                        {program && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-zinc-500 truncate">{program.Title}</span>
                            <span className="text-[10px] text-zinc-600 shrink-0">&middot; {Math.ceil((program.EndTime - Math.floor(Date.now() / 1000)) / 60)}m</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {channels.length === 0 && (
                <div className="p-6 text-center text-zinc-500 text-sm">
                  {hdhrStatus?.connected ? 'Loading channels...' : 'No HDHomeRun detected'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Video Player Overlay Component ──────────────────────────────────────────

function VideoPlayerOverlay({ videoContainerRef, isPlaying, isBuffering, selectedChannel, guide, channelMeta, loadingBlurb, onStop }: {
  videoContainerRef: React.RefObject<HTMLDivElement>;
  isPlaying: boolean;
  isBuffering: boolean;
  selectedChannel: TVChannel | null;
  guide: GuideChannel[];
  channelMeta: Record<string, { network: string; color: string; logo?: string }>;
  loadingBlurb: string;
  onStop: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, setTick] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now = Math.floor(Date.now() / 1000);
  const guideChannel = selectedChannel ? guide.find((g) => g.GuideNumber === selectedChannel.GuideNumber) : null;
  const entries = guideChannel?.Guide || [];
  const current = entries.find((e) => e.StartTime <= now && e.EndTime > now);
  const next = entries.find((e) => e.StartTime > now);
  const network = selectedChannel ? channelMeta[selectedChannel.GuideNumber.split('.')[0]]?.network : undefined;

  const showInfo = useTVShowInfo(current?.Title);

  const progress = current ? Math.min(100, Math.round(((now - current.StartTime) / (current.EndTime - current.StartTime)) * 100)) : 0;
  const timeRemaining = current ? Math.max(0, Math.ceil((current.EndTime - now) / 60)) : 0;
  const formatTime = (epoch: number) => new Date(epoch * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const revealOverlay = useCallback(() => {
    if (!isPlaying) return;
    setShowOverlay(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowOverlay(false), 4000);
  }, [isPlaying]);

  useEffect(() => {
    const onFS = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFS);
    return () => document.removeEventListener('fullscreenchange', onFS);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current.requestFullscreen();
  };

  const togglePlayPause = () => {
    const video = videoContainerRef.current?.querySelector('video');
    if (!video) return;
    if (video.paused) video.play(); else video.pause();
  };

  return (
    <div
      ref={containerRef}
      className={`relative bg-black flex items-center justify-center ${isFullscreen ? 'w-screen h-screen' : 'aspect-video'}`}
      onMouseMove={revealOverlay}
      onMouseEnter={revealOverlay}
      onClick={revealOverlay}
    >
      {/* Video element mount point */}
      <div ref={videoContainerRef} className="w-full h-full" />

      {/* Idle */}
      {!isPlaying && !isBuffering && !selectedChannel && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-raised">
          <div className="text-center">
            <div className="text-4xl mb-2 opacity-30">📺</div>
            <p className="text-sm text-zinc-500">Select a channel to start watching</p>
          </div>
        </div>
      )}

      {/* Buffering */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-raised/95 backdrop-blur-sm">
          <div className="text-center space-y-4">
            <div className="flex items-end justify-center gap-1 h-10">
              {[0, 150, 300, 450, 600, 750, 900].map((delay, i) => (
                <div key={i} className="w-2 bg-brand rounded-full animate-[bounce_1s_ease-in-out_infinite]"
                  style={{ height: `${40 + (i < 4 ? i * 20 : (6 - i) * 20)}%`, animationDelay: `${delay}ms` }} />
              ))}
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Tuning to {selectedChannel?.GuideName}</p>
              <p className="text-xs text-zinc-400 mt-1.5 italic">{loadingBlurb}</p>
              <p className="text-2xs text-zinc-600 mt-3">This can take up to 10 seconds</p>
            </div>
          </div>
        </div>
      )}

      {/* Overlay */}
      {isPlaying && selectedChannel && (
        <div className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none ${showOverlay ? 'opacity-100' : 'opacity-0'}`}>
          {/* Top */}
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-5 pointer-events-auto">
            <div className="flex items-center gap-2.5">
              <span className="text-base font-mono font-bold text-tv">{selectedChannel.GuideNumber}</span>
              <span className="text-base font-semibold text-white drop-shadow-lg">{selectedChannel.GuideName}</span>
              {network && <span className="text-xs text-white/70 bg-white/15 backdrop-blur-sm rounded-md px-2 py-0.5 font-medium">{network}</span>}
            </div>
          </div>

          {/* Bottom */}
          <div className="bg-gradient-to-t from-black/90 via-black/70 to-transparent pt-16 pb-5 px-5 pointer-events-auto">
            {current && (
              <div className="flex items-end gap-4 mb-4">
                {showInfo?.image && (
                  <img src={showInfo.image} alt="" className="w-16 h-24 rounded-lg object-cover shrink-0 shadow-2xl hidden sm:block ring-1 ring-white/10"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-white drop-shadow-lg leading-tight">{current.Title}</h3>
                  {current.EpisodeTitle && <p className="text-sm text-white/70 mt-0.5">&ldquo;{current.EpisodeTitle}&rdquo;</p>}
                  <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                    {showInfo?.rating && (
                      <span className="flex items-center gap-1 text-sm text-yellow-400 font-medium">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        {showInfo.rating}
                      </span>
                    )}
                    {showInfo?.genres.slice(0, 3).map((g) => (
                      <span key={g} className="text-xs text-white/70 bg-white/10 backdrop-blur-sm rounded-md px-2 py-0.5">{g}</span>
                    ))}
                    {timeRemaining > 0 && <span className="text-xs text-white/50 font-mono">{timeRemaining} min left</span>}
                  </div>
                  {(current.Synopsis || showInfo?.summary) && (
                    <p className="text-sm text-white/60 mt-2 line-clamp-2 leading-relaxed max-w-2xl hidden sm:block">{current.Synopsis || showInfo?.summary}</p>
                  )}
                  {showInfo?.cast && showInfo.cast.length > 0 && (
                    <div className="flex items-center gap-3 mt-2.5 hidden md:flex">
                      {showInfo.cast.slice(0, 4).map((c) => (
                        <div key={c.name} className="flex items-center gap-1.5">
                          {c.image && <img src={c.image} alt="" className="w-6 h-6 rounded-full object-cover ring-1 ring-white/20" />}
                          <span className="text-xs text-white/60">{c.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {current && (
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden mb-4 cursor-pointer group">
                <div className="h-full bg-tv rounded-full transition-all duration-1000 group-hover:bg-tv/90" style={{ width: `${progress}%` }} />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={togglePlayPause} className="text-white/90 hover:text-white transition-colors hover:scale-110 active:scale-95">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <button onClick={onStop} className="text-white/60 hover:text-red-400 transition-colors hover:scale-110 active:scale-95">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                </button>
                {current && <span className="text-sm text-white/60 font-mono ml-1">{formatTime(current.StartTime)} – {formatTime(current.EndTime)}</span>}
              </div>
              <div className="flex items-center gap-4">
                {next && <span className="text-sm text-white/50 hidden sm:inline">Next: <span className="text-white/70">{next.Title}</span></span>}
                <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors hover:scale-110 active:scale-95">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {isFullscreen
                      ? <><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></>
                      : <><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></>
                    }
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TVPage;
