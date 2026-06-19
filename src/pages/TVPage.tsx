import { useState, useEffect, useRef } from 'react';

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
const channelMeta: Record<string, { network: string; color: string }> = {
  '3': { network: 'IND', color: '#6366f1' },
  '5': { network: 'CBS', color: '#2563eb' },
  '7': { network: 'CW', color: '#16a34a' },
  '8': { network: 'PBS', color: '#0891b2' },
  '10': { network: 'NBC', color: '#f59e0b' },
  '12': { network: 'NBC', color: '#f59e0b' },
  '15': { network: 'ABC', color: '#000000' },
  '45': { network: 'Uni', color: '#dc2626' },
  '61': { network: 'IND', color: '#6366f1' },
};

function TVPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [guide, setGuide] = useState<GuideChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hdhrStatus, setHdhrStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);

  // Fetch lineup and status on mount
  useEffect(() => {
    fetchLineup();
    fetchStatus();
    fetchGuide();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/hdhr/status');
      const data = await res.json();
      setHdhrStatus(data);
    } catch { setHdhrStatus(null); }
  };

  const fetchLineup = async () => {
    try {
      const res = await fetch('/api/hdhr/lineup');
      if (!res.ok) throw new Error('Failed to get lineup');
      const data = await res.json();
      setChannels(data);
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
    setSelectedChannel(channel);

    // Start mpegts.js player
    const mpegts = await import('mpegts.js');
    if (!mpegts.default.isSupported()) {
      setError('MPEG-TS playback not supported in this browser');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const player = mpegts.default.createPlayer({
      type: 'mpegts',
      isLive: true,
      url: `${window.location.origin}/api/hdhr/stream/${channel.GuideNumber}`,
    }, {
      enableWorker: true,
      liveBufferLatencyChasing: false,    // disable — causes back-and-forth judder
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 60,
      autoCleanupMinBackwardDuration: 30,
      fixAudioTimestampGap: true,
    });

    player.attachMediaElement(video);
    player.load();
    player.play();
    playerRef.current = player;
    setIsPlaying(true);
  };

  const stopPlayback = () => {
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    setIsPlaying(false);
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
            <p className="text-xs text-white/30 font-mono mt-0.5">HDHomeRun Flex 4K &middot; OTA Broadcast</p>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-danger">{error}</span>}
            <span className={`badge ${hdhrStatus?.connected ? 'badge-success' : 'badge-danger'}`}>
              {hdhrStatus?.connected ? 'HDHomeRun Connected' : 'No Device'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Video Player */}
        <div className="lg:col-span-2 card p-0 overflow-hidden">
          <div className="relative aspect-video bg-black flex items-center justify-center">
            <video
              ref={videoRef}
              className="w-full h-full"
              autoPlay
              muted={false}
              controls
            />
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
                <div className="text-center">
                  <div className="text-4xl mb-2 opacity-30">📺</div>
                  <p className="text-sm text-white/30">Select a channel to start watching</p>
                </div>
              </div>
            )}
          </div>
          {/* Now playing bar */}
          {selectedChannel && (
            <div className="p-4 border-t border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold text-accent">{selectedChannel.GuideNumber}</span>
                  <span className="text-sm font-medium">{selectedChannel.GuideName}</span>
                </div>
                {getCurrentProgram(selectedChannel.GuideNumber) && (
                  <p className="text-xs text-white/40 mt-0.5">
                    {getCurrentProgram(selectedChannel.GuideNumber)?.Title}
                  </p>
                )}
              </div>
              <button onClick={stopPlayback} className="btn-danger text-xs">Stop</button>
            </div>
          )}
        </div>

        {/* Channel List */}
        <div className="card p-0 max-h-[600px] overflow-y-auto">
          <div className="sticky top-0 p-3 border-b border-white/[0.06] bg-surface-1 z-10">
            <span className="label">Channels ({channels.length})</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {channels.map((ch) => {
              const program = getCurrentProgram(ch.GuideNumber);
              const meta = channelMeta[ch.GuideNumber.split('.')[0]];
              const isActive = selectedChannel?.GuideNumber === ch.GuideNumber;

              return (
                <button
                  key={ch.GuideNumber}
                  onClick={() => tuneChannel(ch)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-white/[0.03] transition-colors ${
                    isActive ? 'bg-accent/5 border-l-2 border-accent' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {meta && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ backgroundColor: `${meta.color}30`, color: meta.color }}>
                        {meta.network}
                      </span>
                    )}
                    <span className="text-xs font-mono text-white/50 w-8">{ch.GuideNumber}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{ch.GuideName}</div>
                      {program && (
                        <div className="text-[11px] text-white/30 truncate">{program.Title}</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {channels.length === 0 && (
              <div className="p-6 text-center text-white/30 text-sm">
                {hdhrStatus?.connected ? 'Loading channels...' : 'No HDHomeRun detected on network'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* EPG Grid */}
      {guide.length > 0 && (
        <div className="card p-5">
          <span className="label">Program Guide</span>
          <div className="mt-3 space-y-1 max-h-80 overflow-y-auto">
            {guide.slice(0, 20).map((ch) => {
              const now = Math.floor(Date.now() / 1000);
              const current = ch.Guide?.find((p) => p.StartTime <= now && p.EndTime > now);
              const next = ch.Guide?.find((p) => p.StartTime > now);

              return (
                <div key={ch.GuideNumber} className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-0">
                  <span className="text-xs font-mono text-white/40 w-8 shrink-0">{ch.GuideNumber}</span>
                  <span className="text-xs text-white/60 w-24 shrink-0 truncate">{ch.GuideName}</span>
                  <div className="flex-1 min-w-0">
                    {current && (
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                        <span className="text-xs text-white/80 truncate">{current.Title}</span>
                        <span className="text-[10px] text-white/25 shrink-0">
                          {new Date(current.EndTime * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                    {next && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/10 shrink-0" />
                        <span className="text-[11px] text-white/30 truncate">Next: {next.Title}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default TVPage;
