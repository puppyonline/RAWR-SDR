import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TVChannel {
  GuideNumber: string;
  GuideName: string;
  URL?: string;
}

export interface TVPlayerState {
  selectedChannel: TVChannel | null;
  isPlaying: boolean;
  isBuffering: boolean;
  error: string;
  loadingBlurb: string;
}

interface TVPlayerContextType {
  state: TVPlayerState;
  tuneChannel: (channel: TVChannel) => Promise<void>;
  stopPlayback: () => void;
  videoElementId: string;
}

const TVPlayerCtx = createContext<TVPlayerContextType | null>(null);

const VIDEO_ELEMENT_ID = 'airwave-tv-video';

// ─── Loading blurbs ────────────────────────────────────────────────────────

const loadingBlurbs = [
  'Waking up the hamsters that power the antenna...',
  'Convincing electrons to flow in the right direction...',
  'Translating ancient MPEG-2 hieroglyphics...',
  'Politely asking ffmpeg to hurry up...',
  'Negotiating with the airwaves...',
  'Converting photons to pixels...',
  'Untangling the electromagnetic spectrum...',
  'Spinning up the transcode hamster wheel...',
  'Herding radio waves into your browser...',
  'Asking the HDHomeRun nicely for some video...',
  'Buffering at the speed of light (minus a few seconds)...',
  'Converting over-the-air freedom into browser content...',
  'Crunching pixels fresh from the antenna...',
];

// ─── Provider ──────────────────────────────────────────────────────────────

export function TVPlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TVPlayerState>({
    selectedChannel: null,
    isPlaying: false,
    isBuffering: false,
    error: '',
    loadingBlurb: '',
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const blurbInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const location = useLocation();

  const isOnTVPage = location.pathname === '/tv';
  const hasPlayback = state.selectedChannel !== null && (state.isPlaying || state.isBuffering);

  // Cycle blurbs while buffering
  useEffect(() => {
    if (state.isBuffering) {
      setState((s) => ({ ...s, loadingBlurb: loadingBlurbs[Math.floor(Math.random() * loadingBlurbs.length)] }));
      blurbInterval.current = setInterval(() => {
        setState((s) => ({ ...s, loadingBlurb: loadingBlurbs[Math.floor(Math.random() * loadingBlurbs.length)] }));
      }, 3000);
    } else {
      if (blurbInterval.current) clearInterval(blurbInterval.current);
    }
    return () => { if (blurbInterval.current) clearInterval(blurbInterval.current); };
  }, [state.isBuffering]);

  const tuneChannel = useCallback(async (channel: TVChannel) => {
    // Destroy previous player
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    setState({
      selectedChannel: channel,
      isPlaying: false,
      isBuffering: true,
      error: '',
      loadingBlurb: loadingBlurbs[Math.floor(Math.random() * loadingBlurbs.length)],
    });

    // Wait a tick for React to render the video visible
    await new Promise((r) => setTimeout(r, 100));

    const mpegts = await import('mpegts.js');
    if (!mpegts.default.isSupported()) {
      setState((s) => ({ ...s, error: 'MPEG-TS not supported', isBuffering: false }));
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setState((s) => ({ ...s, isBuffering: false, error: 'Video element not ready' }));
      return;
    }

    video.onplaying = () => setState((s) => ({ ...s, isBuffering: false, isPlaying: true }));
    video.onwaiting = () => setState((s) => ({ ...s, isBuffering: true }));

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

    player.on('error', () => {
      setState((s) => ({
        ...s,
        error: 'Channel unavailable — may be ATSC 3.0/DRM',
        isPlaying: false,
        isBuffering: false,
      }));
    });
  }, []);

  const stopPlayback = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.onplaying = null;
      videoRef.current.onwaiting = null;
    }
    setState({
      selectedChannel: null,
      isPlaying: false,
      isBuffering: false,
      error: '',
      loadingBlurb: '',
    });
  }, []);

  useEffect(() => {
    return () => { if (playerRef.current) playerRef.current.destroy(); };
  }, []);

  // Show mini-player when playing and NOT on TV page
  const showMiniPlayer = hasPlayback && !isOnTVPage;

  // Clear any inline styles when leaving the TV page
  // (TV page sets inline position styles that would conflict with mini-player classes)
  useEffect(() => {
    const container = document.getElementById('tv-player-container');
    if (!container) return;
    if (!isOnTVPage) {
      container.style.cssText = '';
    }
  }, [isOnTVPage]);

  return (
    <TVPlayerCtx.Provider value={{ state, tuneChannel, stopPlayback, videoElementId: VIDEO_ELEMENT_ID }}>
      {children}

      {/* 
        Single video element — NEVER unmounted, NEVER moved in the DOM.
        Visibility/size is controlled purely via CSS classes.
        - On TV page: invisible here (TV page shows it via a portal-like CSS trick)
        - On other pages with playback: mini-player in bottom-right
        - No playback: completely hidden
      */}
      <div
        id="tv-player-container"
        className={
          isOnTVPage
            ? 'fixed top-0 left-0 w-px h-px overflow-hidden opacity-0 pointer-events-none -z-50'
            : showMiniPlayer
              ? 'fixed bottom-4 right-4 z-50 w-80 aspect-video rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-black group cursor-pointer'
              : 'fixed top-0 left-0 w-px h-px overflow-hidden opacity-0 pointer-events-none -z-50'
        }
      >
        <video
          ref={videoRef}
          id={VIDEO_ELEMENT_ID}
          className="w-full h-full object-contain bg-black"
          autoPlay
          playsInline
          muted={false}
        />

        {/* Mini-player hover overlay */}
        {showMiniPlayer && (
          <MiniPlayerOverlay
            channel={state.selectedChannel}
            onStop={stopPlayback}
          />
        )}
      </div>
    </TVPlayerCtx.Provider>
  );
}

function MiniPlayerOverlay({ channel, onStop }: { channel: TVChannel | null; onStop: () => void }) {
  const navigate = useNavigate();

  return (
    <div className="absolute inset-0 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <div className="bg-gradient-to-b from-black/80 to-transparent p-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-tv animate-pulse" />
          <span className="text-xs font-mono text-tv font-bold">{channel?.GuideNumber}</span>
          <span className="text-sm text-white font-medium truncate">{channel?.GuideName}</span>
        </div>
      </div>
      <div className="bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center justify-between">
        <button
          onClick={(e) => { e.stopPropagation(); navigate('/tv'); }}
          className="text-xs text-white/70 hover:text-white transition-colors flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>
          Expand
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onStop(); }}
          className="text-white/60 hover:text-red-400 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useTVPlayer() {
  const ctx = useContext(TVPlayerCtx);
  if (!ctx) throw new Error('useTVPlayer must be used within TVPlayerProvider');
  return ctx;
}
