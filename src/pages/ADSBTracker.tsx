import { useState, useEffect } from 'react';

interface Aircraft {
  hex: string;
  flight: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  squawk: string;
  seen: number;
}

const mockAircraft: Aircraft[] = [
  { hex: 'A1B2C3', flight: 'UAL1234', lat: 40.712, lon: -74.006, altitude: 35000, speed: 480, heading: 270, squawk: '1200', seen: 1 },
  { hex: 'D4E5F6', flight: 'DAL567', lat: 40.750, lon: -73.950, altitude: 28000, speed: 420, heading: 180, squawk: '4521', seen: 3 },
  { hex: 'A7B8C9', flight: 'AAL890', lat: 40.680, lon: -74.050, altitude: 12000, speed: 320, heading: 45, squawk: '2300', seen: 2 },
  { hex: 'D1E2F3', flight: 'SWA321', lat: 40.730, lon: -73.880, altitude: 5000, speed: 210, heading: 90, squawk: '0401', seen: 5 },
  { hex: 'A4B5C6', flight: 'JBU456', lat: 40.780, lon: -74.020, altitude: 41000, speed: 510, heading: 320, squawk: '5501', seen: 1 },
  { hex: 'D7E8F9', flight: 'N172SP', lat: 40.690, lon: -73.920, altitude: 3500, speed: 110, heading: 135, squawk: '1200', seen: 8 },
];

function ADSBTracker() {
  const [aircraft, setAircraft] = useState<Aircraft[]>(mockAircraft);
  const [isTracking, setIsTracking] = useState(false);
  const [selected, setSelected] = useState<Aircraft | null>(null);

  useEffect(() => {
    if (!isTracking) return;
    const interval = setInterval(() => {
      setAircraft((prev) =>
        prev.map((ac) => ({
          ...ac,
          lat: ac.lat + (Math.random() - 0.5) * 0.003,
          lon: ac.lon + (Math.random() - 0.5) * 0.003,
          altitude: Math.max(1000, ac.altitude + Math.floor((Math.random() - 0.5) * 200)),
          speed: Math.max(80, ac.speed + Math.floor((Math.random() - 0.5) * 10)),
          heading: (ac.heading + Math.floor((Math.random() - 0.5) * 5) + 360) % 360,
          seen: Math.max(0, ac.seen + Math.floor(Math.random() * 3) - 1),
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, [isTracking]);

  const startTracking = async () => {
    try {
      await fetch('/api/adsb/start', { method: 'POST' });
      setIsTracking(true);
    } catch {
      setIsTracking(true); // Still simulate for demo
    }
  };

  const stopTracking = async () => {
    try {
      await fetch('/api/adsb/stop', { method: 'POST' });
    } catch { /* ignore */ }
    setIsTracking(false);
  };

  return (
    <div className="space-y-3">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">ADS-B Tracker</h2>
            <p className="text-xs text-muted font-mono mt-0.5">1090 MHz &middot; Mode-S Transponder</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Aircraft:</span>
              <span className="text-sm font-mono font-semibold text-emerald-400">{aircraft.length}</span>
            </div>
            <button
              onClick={isTracking ? stopTracking : startTracking}
              className={isTracking ? 'btn-danger' : 'btn-primary'}
            >
              {isTracking ? 'Stop' : 'Start'} Tracking
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Radar view */}
        <div className="lg:col-span-2 card p-4">
          <div className="w-full h-[400px] rounded-lg bg-raised relative overflow-hidden">
            {/* Grid overlay */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0 border border-white/10 rounded-lg" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-white/10" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full border border-white/10" />
            </div>

            {/* Aircraft plots */}
            {aircraft.map((ac) => {
              const x = ((ac.lon + 74.1) / 0.3) * 100;
              const y = ((40.8 - ac.lat) / 0.2) * 100;
              const isSelected = selected?.hex === ac.hex;
              return (
                <div
                  key={ac.hex}
                  className="absolute cursor-pointer group"
                  style={{ left: `${Math.min(95, Math.max(5, x))}%`, top: `${Math.min(95, Math.max(5, y))}%` }}
                  onClick={() => setSelected(ac)}
                >
                  <div
                    className={`w-2 h-2 rounded-full transition-all ${
                      isSelected ? 'bg-emerald-400 scale-150 shadow-lg shadow-emerald-400/50' : 'bg-emerald-400/70'
                    }`}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block">
                    <div className="card-inner px-2 py-1 text-[10px] font-mono whitespace-nowrap">
                      {ac.flight} &middot; {ac.altitude.toLocaleString()}ft
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="absolute bottom-3 left-3 text-[10px] font-mono text-primary/20">
              {isTracking ? 'LIVE' : 'IDLE'}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <div className="card p-5">
          <span className="label mb-3 block">{selected ? 'Aircraft Detail' : 'Select Aircraft'}</span>
          {selected ? (
            <div className="space-y-3">
              <InfoRow label="Callsign" value={selected.flight} highlight />
              <InfoRow label="ICAO Hex" value={selected.hex} />
              <InfoRow label="Altitude" value={`${selected.altitude.toLocaleString()} ft`} />
              <InfoRow label="Speed" value={`${selected.speed} kts`} />
              <InfoRow label="Heading" value={`${selected.heading}\u00B0`} />
              <InfoRow label="Squawk" value={selected.squawk} />
              <InfoRow label="Position" value={`${selected.lat.toFixed(4)}, ${selected.lon.toFixed(4)}`} />
              <InfoRow label="Last Seen" value={`${selected.seen}s ago`} />
            </div>
          ) : (
            <p className="text-sm text-muted">Click an aircraft on the radar or table below.</p>
          )}
        </div>
      </div>

      {/* Aircraft table */}
      <div className="card p-5 overflow-x-auto">
        <span className="label">Aircraft List</span>
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className="text-muted text-xs border-b border-white/[0.06]">
              <th className="text-left py-2 px-3 font-medium">Flight</th>
              <th className="text-left py-2 px-3 font-medium">ICAO</th>
              <th className="text-right py-2 px-3 font-medium">Altitude</th>
              <th className="text-right py-2 px-3 font-medium">Speed</th>
              <th className="text-right py-2 px-3 font-medium">Hdg</th>
              <th className="text-right py-2 px-3 font-medium">Squawk</th>
              <th className="text-right py-2 px-3 font-medium">Seen</th>
            </tr>
          </thead>
          <tbody>
            {aircraft.map((ac) => (
              <tr
                key={ac.hex}
                onClick={() => setSelected(ac)}
                className={`cursor-pointer transition-colors border-b border-white/[0.03] hover:bg-white/[0.02] ${
                  selected?.hex === ac.hex ? 'bg-emerald-500/5' : ''
                }`}
              >
                <td className="py-2.5 px-3 font-mono font-medium">{ac.flight}</td>
                <td className="py-2.5 px-3 font-mono text-muted">{ac.hex}</td>
                <td className="py-2.5 px-3 text-right font-mono">{ac.altitude.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right font-mono">{ac.speed}</td>
                <td className="py-2.5 px-3 text-right font-mono">{ac.heading}&deg;</td>
                <td className="py-2.5 px-3 text-right font-mono text-muted">{ac.squawk}</td>
                <td className="py-2.5 px-3 text-right text-muted">{ac.seen}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className={`font-mono text-sm ${highlight ? 'text-emerald-400 font-semibold' : 'text-secondary'}`}>{value}</span>
    </div>
  );
}

export default ADSBTracker;
