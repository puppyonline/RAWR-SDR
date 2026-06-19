import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Channel {
  GuideNumber: string;
  GuideName: string;
  URL: string;
  Tags?: string;
}

interface TVPlayerState {
  selectedChannel: Channel | null;
  isPlaying: boolean;
  isBuffering: boolean;
  error: string;
  loadingBlurb: string;
}

interface TVPlayerContext {
  state: TVPlayerState;
  videoRef: React.RefObject<HTMLVideoElement>;
  tuneChannel: (channel: Channel) => Promise<void>;
  stopPlayback: () => void;
}

const TVPlayerCtx = createContext<TVPlayerContext | null>(null);

// ─── Loading blurbs ────────────────────────────────────────────────────────

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
  'Decoding the mysteries of broadcast television...',
  'Spinning up the transcode hamster wheel...',
  'Hold tight, we\'re surfing the airwaves...',
  'Herding radio waves into your browser...',
  'Asking the HDHomeRun nicely for some video...',
  'Buffering at the speed of light (minus a few seconds)...',
  'Fun fact: TV signals travel at 186,000 miles per second...',
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

  const tuneChannel = useCallback(async (channel: Channel) => {
    // Stop current
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    setState((s) => ({
      ...s,
      selectedChannel: channel,
      isPlaying: false,
      isBuffering: true,
      error: '',
    }));

    const mpegts = await import('mpegts.js');
    if (!mpegts.default.isSupported()) {
      setState((s) => ({ ...s, error: 'MPEG-TS not supported in this browser', isBuffering: false }));
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setState((s) => ({ ...s, isBuffering: false }));
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
        error: 'Channel unavailable — may be an ATSC 3.0/DRM channel',
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
    setState({
      selectedChannel: null,
      isPlaying: false,
      isBuffering: false,
      error: '',
      loadingBlurb: '',
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) playerRef.current.destroy();
    };
  }, []);

  return (
    <TVPlayerCtx.Provider value={{ state, videoRef, tuneChannel, stopPlayback }}>
      {/* Hidden video element that persists across page navigations */}
      <video ref={videoRef} className="hidden" autoPlay muted={false} />
      {children}
    </TVPlayerCtx.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useTVPlayer() {
  const ctx = useContext(TVPlayerCtx);
  if (!ctx) throw new Error('useTVPlayer must be used within TVPlayerProvider');
  return ctx;
}
