import { useState, useEffect, useRef } from 'react';

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
  { hex: 'A1B2C3', flight: 'UAL1234', lat: 40.7128, lon: -74.006, altitude: 35000, speed: 480, heading: 270, squawk: '1200', seen: 1 },
  { hex: 'D4E5F6', flight: 'DAL567', lat: 40.75, lon: -73.95, altitude: 28000, speed: 420, heading: 180, squawk: '4521', seen: 3 },
  { hex: 'A7B8C9', flight: 'AAL890', lat: 40.68, lon: -74.05, altitude: 12000, speed: 320, heading: 45, squawk: '2300', seen: 2 },
  { hex: 'D1E2F3', flight: 'SWA321', lat: 40.73, lon: -73.88, altitude: 5000, speed: 210, heading: 90, squawk: '0401', seen: 5 },
  { hex: 'A4B5C6', flight: 'JBU456', lat: 40.78, lon: -74.02, altitude: 41000, speed: 510, heading: 320, squawk: '5501', seen: 1 },
  { hex: 'D7E8F9', flight: 'N172SP', lat: 40.69, lon: -73.92, altitude: 3500, speed: 110, heading: 135, squawk: '1200', seen: 8 },
];

function ADSBTracker() {
  const [aircraft, setAircraft] = useState<Aircraft[]>(mockAircraft);
  const [isTracking, setIsTracking] = useState(false);
  const [selectedAircraft, setSelected] = useState<Aircraft | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTracking) return;
    const interval = setInterval(() => {
      setAircraft((prev) =>
        prev.map((ac) => ({
          ...ac,
          lat: ac.lat + (Math.random() - 0.5) * 0.005,
          lon: ac.lon + (Math.random() - 0.5) * 0.005,
          altitude: ac.altitude + Math.floor((Math.random() - 0.5) * 200),
          speed: Math.max(80, ac.speed + Math.floor((Math.random() - 0.5) * 10)),
          seen: Math.max(0, ac.seen + Math.floor(Math.random() * 3) - 1),
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, [isTracking]);

  return (
    <div className="space-y-4">
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">ADS-B Tracker</h2>
            <p className="text-white/50 text-sm">1090 MHz Mode-S Transponder Decoding</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-white/60">
              <span className="text-emerald-400 font-bold">{aircraft.length}</span> aircraft tracked
            </div>
            <button
              onClick={() => setIsTracking(!isTracking)}
              className={`glass-button ${isTracking ? 'bg-emerald-500/20 border-emerald-400/50' : ''}`}
            >
              {isTracking ? '⏹ Stop' : '▶ Start'} Tracking
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map placeholder */}
        <div className="lg:col-span-2 glass-panel p-4">
          <div
            ref={mapRef}
            className="w-full h-96 rounded-lg bg-slate-900/50 flex items-center justify-center relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-20">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.1)_0%,transparent_70%)]" />
              {aircraft.map((ac) => (
                <div
                  key={ac.hex}
                  className="absolute w-3 h-3 cursor-pointer group"
                  style={{
                    left: `${((ac.lon + 74.1) / 0.3) * 100}%`,
                    top: `${((40.8 - ac.lat) / 0.2) * 100}%`,
                    transform: `rotate(${ac.heading}deg)`,
                  }}
                  onClick={() => setSelected(ac)}
                >
                  <div className="text-emerald-400 text-xs">✈</div>
                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 glass-panel-sm px-2 py-1 text-xs whitespace-nowrap z-10">
                    {ac.flight}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-white/30 text-sm z-10">
              Map View - {aircraft.length} aircraft
            </div>
          </div>
        </div>

        {/* Selected aircraft details */}
        <div className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-white/70 mb-3">
            {selectedAircraft ? 'Aircraft Detail' : 'Select Aircraft'}
          </h3>
          {selectedAircraft ? (
            <div className="space-y-3">
              <DetailRow label="Callsign" value={selectedAircraft.flight} />
              <DetailRow label="ICAO Hex" value={selectedAircraft.hex} />
              <DetailRow label="Altitude" value={`${selectedAircraft.altitude.toLocaleString()} ft`} />
              <DetailRow label="Speed" value={`${selectedAircraft.speed} kts`} />
              <DetailRow label="Heading" value={`${selectedAircraft.heading}°`} />
              <DetailRow label="Squawk" value={selectedAircraft.squawk} />
              <DetailRow label="Position" value={`${selectedAircraft.lat.toFixed(4)}, ${selectedAircraft.lon.toFixed(4)}`} />
              <DetailRow label="Last Seen" value={`${selectedAircraft.seen}s ago`} />
            </div>
          ) : (
            <p className="text-white/40 text-sm">Click an aircraft on the map or table to view details.</p>
          )}
        </div>
      </div>

      {/* Aircraft table */}
      <div className="glass-panel p-6 overflow-x-auto">
        <h3 className="text-sm font-semibold text-white/70 mb-3">Aircraft List</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/50 border-b border-white/10">
              <th className="text-left py-2 px-3">Flight</th>
              <th className="text-left py-2 px-3">ICAO</th>
              <th className="text-right py-2 px-3">Altitude</th>
              <th className="text-right py-2 px-3">Speed</th>
              <th className="text-right py-2 px-3">Heading</th>
              <th className="text-right py-2 px-3">Squawk</th>
              <th className="text-right py-2 px-3">Seen</th>
            </tr>
          </thead>
          <tbody>
            {aircraft.map((ac) => (
              <tr
                key={ac.hex}
                onClick={() => setSelected(ac)}
                className={`cursor-pointer hover:bg-white/5 transition-colors border-b border-white/5 ${
                  selectedAircraft?.hex === ac.hex ? 'bg-emerald-500/10' : ''
                }`}
              >
                <td className="py-2 px-3 font-mono font-semibold">{ac.flight}</td>
                <td className="py-2 px-3 font-mono text-white/60">{ac.hex}</td>
                <td className="py-2 px-3 text-right">{ac.altitude.toLocaleString()} ft</td>
                <td className="py-2 px-3 text-right">{ac.speed} kts</td>
                <td className="py-2 px-3 text-right">{ac.heading}°</td>
                <td className="py-2 px-3 text-right font-mono">{ac.squawk}</td>
                <td className="py-2 px-3 text-right text-white/50">{ac.seen}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/50 text-sm">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

export default ADSBTracker;
