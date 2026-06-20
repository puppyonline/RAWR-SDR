import { useState, useEffect, useRef } from 'react';

interface Aircraft {
  hex: string;
  flight: string;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  verticalRate: number | null;
  squawk: string;
  seen: number;
  messages: number;
  rssi: number | null;
  category: string;
  emergency: string;
}

function ADSBTracker() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [selected, setSelected] = useState<Aircraft | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for aircraft data when tracking
  useEffect(() => {
    if (!isTracking) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const poll = () => {
      fetch('/api/adsb/aircraft')
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) {
            setAircraft(data.aircraft || []);
            if (!data.tracking) setIsTracking(false);
          }
        })
        .catch(() => {});
    };

    poll();
    pollRef.current = setInterval(poll, 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isTracking]);

  const startTracking = async () => {
    try {
      await fetch('/api/adsb/start', { method: 'POST' });
      setIsTracking(true);
    } catch {}
  };

  const stopTracking = async () => {
    try {
      await fetch('/api/adsb/stop', { method: 'POST' });
    } catch {}
    setIsTracking(false);
    setAircraft([]);
  };

  return (
    <div className="space-y-3">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">ADS-B Tracker</h2>
            <p className="text-xs text-muted font-mono mt-0.5">1090 MHz &middot; dump1090 &middot; R820T Dongle</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Aircraft:</span>
              <span className="text-sm font-mono font-semibold text-emerald-400">{aircraft.length}</span>
            </div>
            <button
              onClick={isTracking ? stopTracking : startTracking}
              className={isTracking ? 'btn-danger btn-sm' : 'btn-brand btn-sm'}
            >
              {isTracking ? 'Stop' : 'Start'} Tracking
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Aircraft list (replaces radar for now — no lat/lon from rtl_adsb) */}
        <div className="lg:col-span-2 card p-0 max-h-[500px] overflow-y-auto">
          <div className="sticky top-0 p-3 border-b border-white/[0.06] bg-[var(--color-card)] z-10">
            <span className="label">{isTracking ? 'Live Aircraft' : 'Start tracking to see aircraft'}</span>
          </div>
          {aircraft.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-white/[0.06]">
                  <th className="text-left py-2 px-3 font-medium">Flight</th>
                  <th className="text-left py-2 px-3 font-medium">ICAO</th>
                  <th className="text-right py-2 px-3 font-medium">Alt</th>
                  <th className="text-right py-2 px-3 font-medium">Spd</th>
                  <th className="text-right py-2 px-3 font-medium">Hdg</th>
                  <th className="text-right py-2 px-3 font-medium">Sqwk</th>
                  <th className="text-right py-2 px-3 font-medium">Msgs</th>
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
                    <td className="py-2 px-3 font-mono font-medium text-secondary">{ac.flight || '—'}</td>
                    <td className="py-2 px-3 font-mono text-muted text-xs">{ac.hex}</td>
                    <td className="py-2 px-3 text-right font-mono">{ac.altitude ? ac.altitude.toLocaleString() : '—'}</td>
                    <td className="py-2 px-3 text-right font-mono">{ac.speed ?? '—'}</td>
                    <td className="py-2 px-3 text-right font-mono">{ac.heading ? `${ac.heading}\u00B0` : '—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-muted">{ac.squawk || '—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-faint">{ac.messages}</td>
                    <td className="py-2 px-3 text-right text-muted">{ac.seen}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-muted text-sm">
              {isTracking ? 'Listening for aircraft...' : 'Click Start to begin tracking'}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="card p-5">
          <span className="label mb-3 block">{selected ? 'Aircraft Detail' : 'Select Aircraft'}</span>
          {selected ? (
            <div className="space-y-3">
              <InfoRow label="Callsign" value={selected.flight || 'Unknown'} highlight />
              <InfoRow label="ICAO Hex" value={selected.hex} />
              <InfoRow label="Altitude" value={selected.altitude ? `${selected.altitude.toLocaleString()} ft` : '—'} />
              <InfoRow label="Speed" value={selected.speed ? `${selected.speed} kts` : '—'} />
              <InfoRow label="Heading" value={selected.heading ? `${selected.heading}\u00B0` : '—'} />
              <InfoRow label="Vert Rate" value={selected.verticalRate ? `${selected.verticalRate > 0 ? '+' : ''}${selected.verticalRate} ft/m` : '—'} />
              <InfoRow label="Squawk" value={selected.squawk || '—'} />
              <InfoRow label="Position" value={selected.lat && selected.lon ? `${selected.lat.toFixed(4)}, ${selected.lon.toFixed(4)}` : '—'} />
              <InfoRow label="RSSI" value={selected.rssi ? `${selected.rssi.toFixed(1)} dBFS` : '—'} />
              <InfoRow label="Messages" value={String(selected.messages)} />
              <InfoRow label="Last Seen" value={`${selected.seen}s ago`} />
              {selected.category && <InfoRow label="Category" value={selected.category} />}
              {selected.emergency && selected.emergency !== 'none' && <InfoRow label="Emergency" value={selected.emergency} />}
            </div>
          ) : (
            <p className="text-sm text-muted">Click an aircraft in the table.</p>
          )}

          {/* Info card */}
          <div className="mt-4 pt-4 border-t border-white/[0.04]">
            <span className="label mb-2 block">Receiver Info</span>
            <div className="space-y-1.5">
              <InfoRow label="Dongle" value="NESDR Mini (R820T)" />
              <InfoRow label="Frequency" value="1090 MHz" />
              <InfoRow label="Device" value="#0" />
              <InfoRow label="Status" value={isTracking ? 'Active' : 'Idle'} />
            </div>
          </div>
        </div>
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
