import { Link } from 'react-router-dom';
import { useSDRStatus } from '../hooks/useSDRStatus';
import { useState, useEffect } from 'react';

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category?: string;
  image?: string;
}

function Dashboard() {
  const status = useSDRStatus();
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    fetch('/api/news')
      .then((r) => r.ok ? r.json() : [])
      .then(setNews)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Welcome to Airwave</h1>
          <p className="text-sm text-zinc-500 mt-1">Your local media hub &mdash; Mesa, AZ</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.connected ? 'bg-live animate-pulse-live' : 'bg-danger'}`} />
          <span className="text-xs text-zinc-400">{status.connected ? 'All systems online' : 'SDR offline'}</span>
        </div>
      </div>

      {/* Quick access grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <QuickCard
          to="/fm"
          title="FM Radio"
          subtitle="26 local stations"
          accent="radio"
          icon={<WaveIcon />}
        />
        <QuickCard
          to="/tv"
          title="Live TV"
          subtitle="HDHomeRun Flex 4K"
          accent="tv"
          icon={<TVIcon />}
        />
        <QuickCard
          to="/atc"
          title="ATC Scanner"
          subtitle="PHX • IWA • DVT"
          accent="aviation"
          icon={<PlaneIcon />}
        />
        <QuickCard
          to="/hd"
          title="HD Radio"
          subtitle="27 digital channels"
          accent="radio"
          icon={<HDIcon />}
        />
        <QuickCard
          to="/adsb"
          title="ADS-B Tracker"
          subtitle="1090 MHz transponder"
          accent="aviation"
          icon={<RadarIcon />}
        />
        <QuickCard
          to="/am"
          title="AM Radio"
          subtitle="20 local stations"
          accent="radio"
          icon={<AMIcon />}
        />
      </div>

      {/* Status row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-4">
          <span className="label">SDR Device</span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">{status.device}</span>
            <span className={`badge ${status.connected ? 'badge-live' : 'bg-danger/10 text-danger border border-danger/20'}`}>
              {status.connected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>

        <div className="card p-4">
          <span className="label">HDHomeRun</span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Flex 4K</span>
            <span className="badge badge-live">Connected</span>
          </div>
        </div>

        <div className="card p-4">
          <span className="label">Location</span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Mesa, AZ 85202</span>
            <span className="text-xs text-zinc-500">33.41°N 111.83°W</span>
          </div>
        </div>
      </div>

      {/* Local News */}
      {news.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-200">Local News &amp; Entertainment</h3>
            <span className="text-2xs text-zinc-500">Phoenix / Mesa</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {news.slice(0, 6).map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="card-inner p-3 hover:border-brand/20 transition-colors group flex gap-3"
              >
                {item.image && (
                  <img src={item.image} alt="" className="w-16 h-12 object-cover rounded shrink-0" loading="lazy" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-200 group-hover:text-brand-bright transition-colors line-clamp-2">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-2xs text-zinc-500">{item.source}</span>
                    {item.pubDate && (
                      <span className="text-2xs text-zinc-600">
                        {timeAgo(item.pubDate)}
                      </span>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* About section */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">About Airwave</h3>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Airwave is your centralized hub for all over-the-air media in your local area.
          Tune into FM and AM radio, receive HD Radio with metadata, watch live OTA television
          through your HDHomeRun, scan air traffic control communications, and track aircraft
          overhead via ADS-B &mdash; all from one interface.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Stat label="FM Stations" value="26" />
          <Stat label="AM Stations" value="20" />
          <Stat label="HD Channels" value="27" />
          <Stat label="ATC Freqs" value="25" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-inner p-3 text-center">
      <div className="text-lg font-bold font-mono text-zinc-100">{value}</div>
      <div className="text-2xs text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

function QuickCard({ to, title, subtitle, accent, icon }: {
  to: string; title: string; subtitle: string; accent: string; icon: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    radio: 'border-radio/20 hover:border-radio/40 hover:bg-radio/[0.03]',
    tv: 'border-tv/20 hover:border-tv/40 hover:bg-tv/[0.03]',
    aviation: 'border-aviation/20 hover:border-aviation/40 hover:bg-aviation/[0.03]',
  };
  const iconColors: Record<string, string> = {
    radio: 'text-radio',
    tv: 'text-tv',
    aviation: 'text-aviation',
  };

  return (
    <Link
      to={to}
      className={`card p-4 transition-all duration-200 group ${colors[accent]}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-zinc-50 transition-colors">{title}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
        </div>
        <div className={`opacity-50 group-hover:opacity-80 transition-opacity ${iconColors[accent]}`}>
          {icon}
        </div>
      </div>
    </Link>
  );
}

// Simple inline icons
function WaveIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 12h2l3-9 4 18 4-18 3 9h4"/></svg>;
}
function TVIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M17 2l-5 5-5-5"/></svg>;
}
function PlaneIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>;
}
function HDIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 10v4M7 12h4M11 10v4M15 10h2a2 2 0 010 4h-2v-4z"/></svg>;
}
function RadarIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>;
}
function AMIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 12c0 0 3-8 10-8s10 8 10 8"/><path d="M5 12c0 0 2-5 7-5s7 5 7 5"/><circle cx="12" cy="12" r="2"/></svg>;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default Dashboard;
