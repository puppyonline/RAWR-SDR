import { useState, useEffect, useRef } from 'react';
import { tvNetworkLogos, getTVStationLogo } from '../hooks/useStationLogos';

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
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 3,
      liveBufferLatencyMinRemain: 0.5,
    });

    player.attachMediaElement(video);
    player.load();
    player.play();
    playerRef.current = player;
    setIsPlaying(true);
    setError('');

    // Handle stream errors (e.g. ATSC 3.0 channels returning 503)
    player.on('error', () => {
      setError('Channel unavailable — may be an ATSC 3.0/DRM channel requiring DVR subscription');
      setIsPlaying(false);
    });
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
            <p className="text-xs text-zinc-500 font-mono mt-0.5">HDHomeRun Flex 4K &middot; OTA Broadcast</p>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-danger">{error}</span>}
            <span className={`badge ${hdhrStatus?.connected ? 'badge-live' : 'bg-danger/10 text-danger border border-danger/20'}`}>
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
              <div className="absolute inset-0 flex items-center justify-center bg-bg-raised">
                <div className="text-center">
                  <div className="text-4xl mb-2 opacity-30">📺</div>
                  <p className="text-sm text-zinc-500">Select a channel to start watching</p>
                </div>
              </div>
            )}
          </div>
          {/* Now playing bar */}
          {selectedChannel && (
            <div className="p-4 border-t border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold text-brand">{selectedChannel.GuideNumber}</span>
                  <span className="text-sm font-medium">{selectedChannel.GuideName}</span>
                </div>
                {getCurrentProgram(selectedChannel.GuideNumber) && (
                  <p className="text-xs text-zinc-500 mt-0.5">
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
          <div className="sticky top-0 p-3 border-b border-white/[0.06] bg-bg-card z-10">
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
                        <div className="text-[11px] text-zinc-500 truncate">{program.Title}</div>
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
                  <span className="text-xs font-mono text-zinc-500 w-8 shrink-0">{ch.GuideNumber}</span>
                  <span className="text-xs text-zinc-400 w-24 shrink-0 truncate">{ch.GuideName}</span>
                  <div className="flex-1 min-w-0">
                    {current && (
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                        <span className="text-xs text-zinc-200 truncate">{current.Title}</span>
                        <span className="text-[10px] text-zinc-100/25 shrink-0">
                          {new Date(current.EndTime * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                    {next && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/10 shrink-0" />
                        <span className="text-[11px] text-zinc-500 truncate">Next: {next.Title}</span>
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
