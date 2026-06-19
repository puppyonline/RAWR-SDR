import { Link } from 'react-router-dom';
import { useSDRStatus } from '../hooks/useSDRStatus';

const modules = [
  { path: '/fm', label: 'FM Radio', range: '87.5 - 108 MHz', color: 'text-indigo-400', bg: 'bg-indigo-500/5 border-indigo-500/10' },
  { path: '/am', label: 'AM Radio', range: '530 - 1700 kHz', color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/10' },
  { path: '/atc', label: 'ATC Scanner', range: '118 - 137 MHz', color: 'text-cyan-400', bg: 'bg-cyan-500/5 border-cyan-500/10' },
  { path: '/hd', label: 'HD Radio', range: '87.5 - 108 MHz', color: 'text-purple-400', bg: 'bg-purple-500/5 border-purple-500/10' },
  { path: '/adsb', label: 'ADS-B Tracker', range: '1090 MHz', color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/10' },
];

function Dashboard() {
  const status = useSDRStatus();

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Device overview */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">System Overview</h2>
            <p className="text-sm text-white/40 mt-0.5">RTL-SDR device status and configuration</p>
          </div>
          <span className={status.connected ? 'badge-success' : 'badge-danger'}>
            {status.connected ? 'Online' : 'Disconnected'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBlock label="Device" value={status.device} />
          <StatBlock label="Sample Rate" value={`${(status.sampleRate / 1_000_000).toFixed(1)} MSPS`} />
          <StatBlock label="Gain" value={status.gain} />
          <StatBlock label="Status" value={status.activeMode} />
        </div>
      </div>

      {/* Module grid */}
      <div>
        <h3 className="label mb-3 px-1">Modules</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((m) => (
            <Link
              key={m.path}
              to={m.path}
              className={`card-inner p-5 border hover:border-white/10 hover:bg-white/[0.02] transition-all duration-150 group ${m.bg}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-semibold ${m.color}`}>{m.label}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20 group-hover:text-white/40 transition-colors">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
              <p className="text-xs text-white/30 font-mono">{m.range}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="label mb-3">Getting Started</h3>
          <ul className="space-y-2 text-sm text-white/50">
            <li className="flex items-start gap-2">
              <span className="text-accent mt-0.5">1.</span>
              Ensure RTL-SDR USB dongle is connected
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent mt-0.5">2.</span>
              Install rtl_fm / rtl_sdr drivers in your PATH
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent mt-0.5">3.</span>
              Select a receiver module and tune a frequency
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent mt-0.5">4.</span>
              Click play to start audio streaming
            </li>
          </ul>
        </div>

        <div className="card p-5">
          <h3 className="label mb-3">Requirements</h3>
          <div className="space-y-2 text-sm text-white/50">
            <div className="flex justify-between">
              <span>rtl_fm</span>
              <span className="font-mono text-xs text-white/30">FM / AM / ATC</span>
            </div>
            <div className="flex justify-between">
              <span>nrsc5</span>
              <span className="font-mono text-xs text-white/30">HD Radio</span>
            </div>
            <div className="flex justify-between">
              <span>dump1090</span>
              <span className="font-mono text-xs text-white/30">ADS-B</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-inner p-4">
      <p className="label mb-1">{label}</p>
      <p className="text-sm font-medium text-white/80">{value}</p>
    </div>
  );
}

export default Dashboard;
