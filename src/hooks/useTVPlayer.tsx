import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

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
}

const TVPlayerCtx = createContext<TVPlayerContextType | null>(null);

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

  const videoRef = useRef<HTMLVideoElement>(null!);
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

    // Small delay to ensure video element is visible/mounted
    await new Promise((r) => setTimeout(r, 50));

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

  // Determine mini-player visibility: show when playing and NOT on the TV page
  const showMiniPlayer = hasPlayback && !isOnTVPage;

  return (
    <TVPlayerCtx.Provider value={{ state, tuneChannel, stopPlayback }}>
      {children}

      {/* 
        Single video element — always mounted, never destroyed.
        On TV page: hidden here (TV page renders its own view of the same stream via ID).
        On other pages: shown as a mini-player if actively playing.
      */}
      <div
        id="tv-player-root"
        className={
          isOnTVPage
            ? 'fixed top-0 left-0 w-0 h-0 overflow-hidden pointer-events-none'
            : showMiniPlayer
              ? 'fixed bottom-4 right-4 z-50 w-80 aspect-video rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-black group'
              : 'fixed top-0 left-0 w-0 h-0 overflow-hidden pointer-events-none'
        }
      >
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted={false} />

        {/* Mini-player overlay (only visible on hover when mini) */}
        {showMiniPlayer && (
          <div className="absolute inset-0 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="bg-gradient-to-b from-black/80 to-transparent p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-tv font-bold">{state.selectedChannel?.GuideNumber}</span>
                <span className="text-sm text-white font-medium truncate">{state.selectedChannel?.GuideName}</span>
              </div>
            </div>
            <div className="bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center justify-between">
              <a href="/tv" className="text-xs text-white/70 hover:text-white">
                Expand ↗
              </a>
              <button onClick={stopPlayback} className="text-white/60 hover:text-red-400 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </TVPlayerCtx.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useTVPlayer() {
  const ctx = useContext(TVPlayerCtx);
  if (!ctx) throw new Error('useTVPlayer must be used within TVPlayerProvider');
  return ctx;
}

/**
 * Get a reference to the shared video element (for the TV page to display inline).
 * Call this from the TV page to grab the video element from the provider's DOM.
 */
export function getTVVideoElement(): HTMLVideoElement | null {
  const root = document.getElementById('tv-player-root');
  if (!root) return null;
  return root.querySelector('video');
}
