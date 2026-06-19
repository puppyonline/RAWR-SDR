import { Link } from 'react-router-dom';
import { useSDRStatus } from '../hooks/useSDRStatus';
import { useState, useEffect } from 'react';
import StationLogo from '../components/StationLogo';

// ─── Types ─────────────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category?: string;
  image?: string;
}

interface FMStation {
  freq: number;
  callsign: string;
  format: string;
  slogan?: string;
  city: string;
  popular: boolean;
}

interface TVNowAiring {
  channel: string;
  channelName: string;
  network?: string;
  title: string;
  episodeTitle?: string;
  synopsis?: string;
  startTime: number;
  endTime: number;
  timeRemaining: number;
  progress: number;
}

interface Recommendations {
  radio: { featured: FMStation[]; all: FMStation[] };
  tv: { nowAiring: TVNowAiring[] };
  updatedAt: string;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

function Dashboard() {
  const status = useSDRStatus();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [recs, setRecs] = useState<Recommendations | null>(null);

  useEffect(() => {
    fetch('/api/news')
      .then((r) => r.ok ? r.json() : [])
      .then(setNews)
      .catch(() => {});

    fetch('/api/recommendations')
      .then((r) => r.ok ? r.json() : null)
      .then(setRecs)
      .catch(() => {});

    // Refresh recommendations every 5 minutes (TV shows change)
    const interval = setInterval(() => {
      fetch('/api/recommendations')
        .then((r) => r.ok ? r.json() : null)
        .then(setRecs)
        .catch(() => {});
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-5">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">{getGreeting()}</h1>
          <p className="text-sm text-muted mt-1">Your local over-the-air media hub &mdash; Mesa, AZ</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge label="SDR" connected={status.connected} />
          <StatusBadge label="HDHR" connected={true} />
        </div>
      </div>

      {/* ─── Now on TV ────────────────────────────────────────────────── */}
      {recs?.tv.nowAiring && recs.tv.nowAiring.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-secondary flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-tv animate-pulse" />
              Now on TV
            </h2>
            <Link to="/guide" className="text-2xs text-muted hover:text-brand-bright transition-colors">
              Full Guide &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {recs.tv.nowAiring.slice(0, 6).map((show) => (
              <Link
                key={show.channel}
                to="/tv"
                className="card p-3.5 hover:border-tv/30 transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xs font-mono text-tv font-semibold">{show.channel}</span>
                      {show.network && (
                        <span className="text-2xs text-muted">{show.network}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-secondary truncate group-hover:text-primary transition-colors">
                      {show.title}
                    </p>
                    {show.episodeTitle && (
                      <p className="text-2xs text-muted truncate mt-0.5">{show.episodeTitle}</p>
                    )}
                  </div>
                  <span className="text-2xs text-faint shrink-0">{show.timeRemaining}m left</span>
                </div>
                {/* Progress bar */}
                <div className="mt-2.5 h-1 bg-raised rounded-full overflow-hidden">
                  <div
                    className="h-full bg-tv/60 rounded-full transition-all"
                    style={{ width: `${show.progress}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── Featured Radio Stations ──────────────────────────────────── */}
      {recs?.radio.featured && recs.radio.featured.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-secondary flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-radio animate-pulse" />
              Featured Stations
            </h2>
            <Link to="/fm" className="text-2xs text-muted hover:text-brand-bright transition-colors">
              All FM &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {recs.radio.featured.slice(0, 10).map((station) => (
              <Link
                key={station.callsign}
                to="/fm"
                className="card p-3 hover:border-radio/30 transition-all group flex items-center gap-2.5"
              >
                <StationLogo callsign={station.callsign} size={32} fallbackColor="#8b5cf6" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-secondary group-hover:text-primary truncate">
                    {station.callsign}
                  </p>
                  <p className="text-2xs text-muted truncate">
                    {station.freq} &middot; {station.format}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── Quick Access ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-secondary mb-3">Tune In</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <QuickCard to="/fm" label="FM Radio" count="26 stations" accent="radio" icon={<WaveIcon />} />
          <QuickCard to="/hd" label="HD Radio" count="27 channels" accent="radio" icon={<HDIcon />} />
          <QuickCard to="/am" label="AM Radio" count="20 stations" accent="radio" icon={<AMIcon />} />
          <QuickCard to="/tv" label="Live TV" count="HDHR Flex 4K" accent="tv" icon={<TVIcon />} />
          <QuickCard to="/atc" label="ATC Scanner" count="PHX &middot; IWA" accent="aviation" icon={<PlaneIcon />} />
          <QuickCard to="/adsb" label="ADS-B" count="1090 MHz" accent="aviation" icon={<RadarIcon />} />
        </div>
      </section>

      {/* ─── Local News ───────────────────────────────────────────────── */}
      {news.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-secondary">Local News</h2>
            <span className="text-2xs text-faint">Phoenix / Mesa</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {news.slice(0, 6).map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="card p-3.5 hover:border-brand/20 transition-colors group flex gap-3"
              >
                {item.image && (
                  <img
                    src={item.image}
                    alt=""
                    className="w-20 h-14 object-cover rounded shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-secondary group-hover:text-brand-bright transition-colors line-clamp-2 leading-relaxed">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-2xs text-muted">{item.source}</span>
                    {item.pubDate && (
                      <span className="text-2xs text-faint">{timeAgo(item.pubDate)}</span>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ─── System Info (collapsed) ──────────────────────────────────── */}
      <section className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Stat label="FM" value="26" />
            <Stat label="AM" value="20" />
            <Stat label="HD" value="27" />
            <Stat label="TV" value={recs?.tv.nowAiring.length?.toString() || '—'} />
            <Stat label="ATC" value="25" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xs text-faint">{status.device}</span>
            <div className={`w-1.5 h-1.5 rounded-full ${status.connected ? 'bg-live' : 'bg-danger'}`} />
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatusBadge({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-live animate-pulse-live' : 'bg-danger'}`} />
      <span className="text-2xs text-muted">{label}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-mono font-bold text-secondary">{value}</span>
      <span className="text-2xs text-muted">{label}</span>
    </div>
  );
}

function QuickCard({ to, label, count, accent, icon }: {
  to: string; label: string; count: string; accent: string; icon: React.ReactNode;
}) {
  const borderColors: Record<string, string> = {
    radio: 'hover:border-radio/30',
    tv: 'hover:border-tv/30',
    aviation: 'hover:border-aviation/30',
  };
  const iconColors: Record<string, string> = {
    radio: 'text-radio',
    tv: 'text-tv',
    aviation: 'text-aviation',
  };

  return (
    <Link to={to} className={`card p-3 transition-all group ${borderColors[accent]}`}>
      <div className="flex items-center gap-2.5">
        <div className={`opacity-50 group-hover:opacity-80 transition-opacity ${iconColors[accent]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-secondary group-hover:text-primary transition-colors truncate">{label}</p>
          <p className="text-2xs text-muted" dangerouslySetInnerHTML={{ __html: count }} />
        </div>
      </div>
    </Link>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────────────

function WaveIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 12h2l3-9 4 18 4-18 3 9h4"/></svg>;
}
function TVIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M17 2l-5 5-5-5"/></svg>;
}
function PlaneIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>;
}
function HDIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 10v4M7 12h4M11 10v4M15 10h2a2 2 0 010 4h-2v-4z"/></svg>;
}
function RadarIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>;
}
function AMIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 12c0 0 3-8 10-8s10 8 10 8"/><path d="M5 12c0 0 2-5 7-5s7 5 7 5"/><circle cx="12" cy="12" r="2"/></svg>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late Night Airwave';
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  if (hour < 21) return 'Good Evening';
  return 'Late Night Airwave';
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default Dashboard;
