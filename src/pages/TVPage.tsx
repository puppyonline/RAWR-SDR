import { useState, useEffect, useRef, useCallback } from 'react';
import { tvNetworkLogos, getTVStationLogo } from '../hooks/useStationLogos';
import { useTVShowInfo } from '../hooks/useMetadata';

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
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadingBlurb, setLoadingBlurb] = useState('');
  const [hdhrStatus, setHdhrStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);

  const loadingBlurbs = [
    'Waking up the hamsters that power the antenna...',
    'Convincing electrons to flow in the right direction...',
    'Translating ancient MPEG-2 hieroglyphics...',
    'Politely asking ffmpeg to hurry up...',
    'Adjusting the rabbit ears for optimal reception...',
    'Negotiating with the airwaves...',
    'Converting photons to pixels...',
    'Warming up the cathode ray tubes...',
    'Untangling the electromagnetic spectrum...',
    'Teaching 1s and 0s to become pictures...',
    'Bribing the signal gods for better reception...',
    'Decoding the mysteries of broadcast television...',
    'Performing ancient TV rituals...',
    'Spinning up the transcode hamster wheel...',
    'Channeling our inner antenna...',
    'Hold tight, we\'re surfing the airwaves...',
    'Almost there... probably...',
    'Making the magic happen behind the scenes...',
    'Herding radio waves into your browser...',
    'Asking the HDHomeRun nicely for some video...',
    'Reticulating splines... wait, wrong loading screen...',
    'Buffering at the speed of light (minus a few seconds)...',
    'Fun fact: TV signals travel at 186,000 miles per second...',
    'Converting over-the-air freedom into browser content...',
    'Crunching pixels fresh from the antenna...',
  ];

  // Cycle through blurbs while buffering
  useEffect(() => {
    if (!isBuffering) return;
    setLoadingBlurb(loadingBlurbs[Math.floor(Math.random() * loadingBlurbs.length)]);
    const interval = setInterval(() => {
      setLoadingBlurb(loadingBlurbs[Math.floor(Math.random() * loadingBlurbs.length)]);
    }, 3000);
    return () => clearInterval(interval);
  }, [isBuffering]);

  // Fetch lineup and status on mount (with retry for slow HDHR discovery)
  useEffect(() => {
    const init = async () => {
      // Give server a moment to finish pre-fetch discovery
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
      // Retry once if not connected (discovery may still be in progress)
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
      // Filter out ATSC 3.0 channels (virtual channel numbers >= 100 are typically 3.0)
      // Also filter channels tagged with DRM
      const filtered = data.filter((ch: any) => {
        const num = parseFloat(ch.GuideNumber);
        // ATSC 3.0 channels are typically numbered 100+ in Phoenix market
        if (num >= 100) return false;
        // Skip DRM-tagged channels
        if (ch.DRM) return false;
        return true;
      });
      setChannels(filtered);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchGuide = async () => {
    try {
      const res = await fetch('/api/hdhr/guide');
      if (!res.ok) return;
      const data = await res.json();
      setGuide(data);
    } catch { /* guide is optional */ }
  };

  const tuneChannel = async (channel: Channel) => {
    // Stop current playback
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    setIsPlaying(false);
    setIsBuffering(true);
    setError('');
    setSelectedChannel(channel);

    // Start mpegts.js player
    const mpegts = await import('mpegts.js');
    if (!mpegts.default.isSupported()) {
      setError('MPEG-TS playback not supported in this browser');
      setIsBuffering(false);
      return;
    }

    const video = videoRef.current;
    if (!video) { setIsBuffering(false); return; }

    // Clear buffering when video actually starts playing
    video.onplaying = () => { setIsBuffering(false); setIsPlaying(true); };
    video.onwaiting = () => { setIsBuffering(true); };

    const player = mpegts.default.createPlayer({
      type: 'mpegts',
      isLive: true,
      url: `${window.location.origin}/api/hdhr/stream/${channel.GuideNumber}`,
    }, {
      enableWorker: true,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 3,
      liveBufferLatencyMinRemain: 0.5,
    });

    player.attachMediaElement(video);
    player.load();
    player.play();
    playerRef.current = player;
    setError('');

    // Handle stream errors (e.g. ATSC 3.0 channels returning 503)
    player.on('error', () => {
      setError('Channel unavailable — may be an ATSC 3.0/DRM channel requiring DVR subscription');
      setIsPlaying(false);
      setIsBuffering(false);
    });
  };

  const stopPlayback = () => {
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    setIsPlaying(false);
    setIsBuffering(false);
    setSelectedChannel(null);
  };

  // Get current program for a channel from guide data
  const getCurrentProgram = (guideNumber: string): GuideEntry | null => {
    const now = Math.floor(Date.now() / 1000);
    const ch = guide.find((g) => g.GuideNumber === guideNumber);
    if (!ch?.Guide) return null;
    return ch.Guide.find((p) => p.StartTime <= now && p.EndTime > now) || null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) playerRef.current.destroy();
    };
  }, []);

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
            {error && <span className="text-xs text-danger">{error}</span>}
            <span className={`badge ${hdhrStatus?.connected ? 'badge-live' : hdhrStatus === null ? 'badge-brand' : 'bg-danger/10 text-danger border border-danger/20'}`}>
              {hdhrStatus?.connected ? 'HDHomeRun Connected' : hdhrStatus === null ? 'Connecting...' : 'No Device'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Video Player with Overlay */}
        <div className="lg:col-span-2 card p-0 overflow-hidden flex flex-col">
          <VideoPlayerWithOverlay
            videoRef={videoRef}
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
                  onClick={() => tuneChannel(ch)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-white/[0.03] transition-colors ${
                    isActive ? 'bg-brand/5 border-l-2 border-brand' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {(() => {
                      // Try: 1) hardcoded network logo, 2) dynamic station lookup by name
                      const logoUrl = meta?.logo || getTVStationLogo(ch.GuideName);
                      if (logoUrl) {
                        return <img src={logoUrl} alt={ch.GuideName} className="w-6 h-6 object-contain rounded-sm shrink-0" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
                      }
                      if (meta) {
                        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0" style={{ backgroundColor: `${meta.color}30`, color: meta.color }}>{meta.network}</span>;
                      }
                      return <div className="w-6 h-6 rounded-sm bg-bg-raised shrink-0" />;
                    })()}
                    <span className="text-xs font-mono text-zinc-400 w-8">{ch.GuideNumber}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{ch.GuideName}</div>
                      {program && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-zinc-500 truncate">{program.Title}</span>
                          <span className="text-[10px] text-zinc-600 shrink-0">
                            &middot; {Math.ceil((program.EndTime - Math.floor(Date.now() / 1000)) / 60)}m
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {channels.length === 0 && (
              <div className="p-6 text-center text-zinc-500 text-sm">
                {hdhrStatus?.connected ? 'Loading channels...' : 'No HDHomeRun detected on network'}
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Video Player with Custom Overlay ────────────────────────────────────────

function VideoPlayerWithOverlay({ videoRef, isPlaying, isBuffering, selectedChannel, guide, channelMeta, loadingBlurb, onStop }: {
  videoRef: React.RefObject<HTMLVideoElement>;
  isPlaying: boolean;
  isBuffering: boolean;
  selectedChannel: Channel | null;
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

  // Get current show info
  const now = Math.floor(Date.now() / 1000);
  const guideChannel = selectedChannel ? guide.find((g) => g.GuideNumber === selectedChannel.GuideNumber) : null;
  const entries = guideChannel?.Guide || [];
  const current = entries.find((e) => e.StartTime <= now && e.EndTime > now);
  const next = entries.find((e) => e.StartTime > now);
  const network = selectedChannel ? channelMeta[selectedChannel.GuideNumber.split('.')[0]]?.network : undefined;

  // Fetch TVmaze show info
  const showInfo = useTVShowInfo(current?.Title);

  // Calculate progress
  const progress = current
    ? Math.min(100, Math.round(((now - current.StartTime) / (current.EndTime - current.StartTime)) * 100))
    : 0;
  const timeRemaining = current ? Math.max(0, Math.ceil((current.EndTime - now) / 60)) : 0;

  const formatTime = (epoch: number) =>
    new Date(epoch * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // Re-render every 30s for time updates
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Show overlay on mouse move / tap, auto-hide after 4s
  const revealOverlay = useCallback(() => {
    if (!isPlaying) return;
    setShowOverlay(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowOverlay(false), 4000);
  }, [isPlaying]);

  // Track fullscreen state
  useEffect(() => {
    const onFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  return (
    <div
      ref={containerRef}
      className={`relative bg-black flex items-center justify-center ${isFullscreen ? 'w-screen h-screen' : 'aspect-video'}`}
      onMouseMove={revealOverlay}
      onMouseEnter={revealOverlay}
      onClick={revealOverlay}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        autoPlay
        muted={false}
      />

      {/* Idle state */}
      {!isPlaying && !isBuffering && !selectedChannel && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-raised">
          <div className="text-center">
            <div className="text-4xl mb-2 opacity-30">📺</div>
            <p className="text-sm text-zinc-500">Select a channel to start watching</p>
          </div>
        </div>
      )}

      {/* Buffering state */}
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

      {/* ─── Custom Overlay (shows on hover/tap) ─────────────────────── */}
      {isPlaying && selectedChannel && (
        <div
          className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 pointer-events-none ${
            showOverlay ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Top bar: channel info + show metadata */}
          <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 pointer-events-auto">
            <div className="flex items-start gap-3">
              {/* Show poster */}
              {showInfo?.image && (
                <img
                  src={showInfo.image}
                  alt={showInfo.name}
                  className="w-10 h-14 rounded object-cover shrink-0 shadow-lg hidden sm:block"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-tv">{selectedChannel.GuideNumber}</span>
                  <span className="text-sm font-semibold text-white">{selectedChannel.GuideName}</span>
                  {network && (
                    <span className="badge bg-white/10 text-white/80 text-2xs border border-white/20">{network}</span>
                  )}
                </div>
                {current && (
                  <div className="mt-1">
                    <p className="text-sm text-white/90 font-medium truncate">{current.Title}</p>
                    {current.EpisodeTitle && (
                      <p className="text-xs text-white/60 truncate">&ldquo;{current.EpisodeTitle}&rdquo;</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {showInfo?.rating && (
                        <span className="flex items-center gap-0.5 text-2xs text-yellow-400">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          {showInfo.rating}
                        </span>
                      )}
                      {showInfo?.genres.slice(0, 2).map((g) => (
                        <span key={g} className="text-2xs text-white/50 bg-white/10 rounded px-1.5 py-0.5">{g}</span>
                      ))}
                      {current.Synopsis && (
                        <span className="text-2xs text-white/40 truncate hidden md:inline">{current.Synopsis.slice(0, 80)}...</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Center: play/pause on click */}
          <div className="flex-1" />

          {/* Bottom bar: progress + controls */}
          <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pointer-events-auto">
            {/* Cast row */}
            {showInfo?.cast && showInfo.cast.length > 0 && (
              <div className="flex items-center gap-2 mb-2.5 hidden sm:flex">
                {showInfo.cast.slice(0, 5).map((c) => (
                  <div key={c.name} className="flex items-center gap-1">
                    {c.image && <img src={c.image} alt={c.name} className="w-5 h-5 rounded-full object-cover" />}
                    <span className="text-2xs text-white/50">{c.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Progress bar */}
            {current && (
              <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-3 cursor-pointer">
                <div
                  className="h-full bg-tv rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {/* Controls row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Play/Pause */}
                <button onClick={togglePlayPause} className="text-white/80 hover:text-white transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    {videoRef.current?.paused
                      ? <path d="M8 5v14l11-7z"/>
                      : <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                    }
                  </svg>
                </button>
                {/* Stop */}
                <button onClick={onStop} className="text-white/60 hover:text-red-400 transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                </button>
                {/* Time */}
                {current && (
                  <span className="text-xs text-white/60 font-mono">
                    {formatTime(current.StartTime)} &ndash; {formatTime(current.EndTime)}
                    <span className="text-white/40 ml-2">{timeRemaining}m left</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Up next badge */}
                {next && (
                  <span className="text-2xs text-white/40 hidden sm:inline">
                    Next: {next.Title} at {formatTime(next.StartTime)}
                  </span>
                )}
                {/* Fullscreen */}
                <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {isFullscreen ? (
                      <><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></>
                    ) : (
                      <><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></>
                    )}
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
