import { Link } from 'react-router-dom';

const features = [
  {
    title: 'FM Radio',
    description: 'Tune into local FM stations (87.5 - 108 MHz)',
    icon: '📻',
    path: '/fm',
    gradient: 'from-pink-500/20 to-rose-500/20',
  },
  {
    title: 'AM Radio',
    description: 'Listen to AM broadcasts (530 - 1700 kHz)',
    icon: '🔊',
    path: '/am',
    gradient: 'from-amber-500/20 to-orange-500/20',
  },
  {
    title: 'ATC Scanner',
    description: 'Monitor air traffic control (118 - 137 MHz)',
    icon: '✈️',
    path: '/atc',
    gradient: 'from-cyan-500/20 to-blue-500/20',
  },
  {
    title: 'HD Radio',
    description: 'Digital HD Radio reception with metadata',
    icon: '🎵',
    path: '/hd',
    gradient: 'from-violet-500/20 to-purple-500/20',
  },
  {
    title: 'ADS-B Tracker',
    description: 'Track aircraft with real-time position data',
    icon: '🛫',
    path: '/adsb',
    gradient: 'from-emerald-500/20 to-teal-500/20',
  },
];

function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-8 text-center">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-200 via-cyan-200 to-purple-200 bg-clip-text text-transparent">
          RAWR-SDR
        </h2>
        <p className="text-white/60 max-w-2xl mx-auto">
          Software-defined radio interface for FM, AM, ATC, HD Radio, and ADS-B aircraft tracking.
          Connect your RTL-SDR dongle and explore the radio spectrum.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => (
          <Link
            key={feature.path}
            to={feature.path}
            className={`glass-panel-sm p-6 hover:scale-[1.02] transition-all duration-300 group bg-gradient-to-br ${feature.gradient}`}
          >
            <div className="text-4xl mb-3">{feature.icon}</div>
            <h3 className="text-lg font-semibold mb-1 group-hover:text-purple-200 transition-colors">
              {feature.title}
            </h3>
            <p className="text-sm text-white/50">{feature.description}</p>
          </Link>
        ))}
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-4">System Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatusCard label="SDR Device" value="RTL2832U" status="connected" />
          <StatusCard label="Sample Rate" value="2.4 MSPS" status="active" />
          <StatusCard label="Gain" value="Auto" status="active" />
          <StatusCard label="Temperature" value="42°C" status="normal" />
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, status }: { label: string; value: string; status: string }) {
  const colors: Record<string, string> = {
    connected: 'bg-green-400',
    active: 'bg-blue-400',
    normal: 'bg-emerald-400',
  };

  return (
    <div className="glass-panel-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${colors[status] || 'bg-gray-400'}`} />
        <span className="text-xs text-white/50">{label}</span>
      </div>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

export default Dashboard;
