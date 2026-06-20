import { useState, useEffect, useRef, useCallback } from 'react';

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
  category: string;
  seen: number;
  messages: number;
}

interface AircraftInfo {
  hex: string;
  registration: string | null;
  type: string | null;
  icaoType: string | null;
  owner: string | null;
  airlineIata: string | null;
  airlineIcao: string | null;
  airlineLogo: string | null;
  airframeUrl: string | null;
  photo: string | null;
  photoLink: string | null;
  photographer: string | null;
}

interface TracePoint {
  ts: number;
  lat: number;
  lon: number;
  alt: number;
  speed: number | null;
  heading: number | null;
}

interface TraceData {
  hex: string;
  registration: string | null;
  type: string | null;
  description: string | null;
  operator: string | null;
  trace: TracePoint[];
}

function ADSBTracker() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [selected, setSelected] = useState<Aircraft | null>(null);
  const [acInfo, setAcInfo] = useState<AircraftInfo | null>(null);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const traceLayerRef = useRef<any>(null);
  const infoCacheRef = useRef<Map<string, AircraftInfo>>(new Map());

  // Poll for aircraft data
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
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isTracking]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapRef.current) return;
    // Avoid double-init in React StrictMode
    if (mapRef.current.hasAttribute('data-leaflet-init')) return;
    mapRef.current.setAttribute('data-leaflet-init', 'true');

    let map: any = null;
    import('leaflet').then((L) => {
      if (!mapRef.current) return;
      // Import Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      map = L.map(mapRef.current, { zoomControl: true }).setView([33.4152, -111.8315], 9);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18,
      }).addTo(map);
      leafletMap.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      traceLayerRef.current = L.layerGroup().addTo(map);
      // Fix tile rendering after container is visible
      setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      if (map) { map.remove(); leafletMap.current = null; markersRef.current = null; traceLayerRef.current = null; }
      if (mapRef.current) mapRef.current.removeAttribute('data-leaflet-init');
    };
  }, []);

  // Update markers when aircraft data changes
  useEffect(() => {
    if (!leafletMap.current || !markersRef.current) return;
    import('leaflet').then((L) => {
      markersRef.current.clearLayers();
      const withPos = aircraft.filter((ac) => ac.lat !== null && ac.lon !== null);
      for (const ac of withPos) {
        const isSelected = selected?.hex === ac.hex;
        const size = isSelected ? 28 : 22;
        const color = isSelected ? '#10b981' : '#60a5fa';
        const icon = L.divIcon({
          className: '',
          html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${ac.heading || 0}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))">
            <path d="M12 2L4 14h3l1 8h8l1-8h3L12 2z" fill="${color}" stroke="#fff" stroke-width="1"/>
          </svg>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const marker = L.marker([ac.lat!, ac.lon!], { icon })
          .bindTooltip(
            `<b>${ac.flight || ac.hex}</b><br>${ac.altitude ? ac.altitude.toLocaleString() + ' ft' : 'GND'}${ac.speed ? '<br>' + ac.speed + ' kts' : ''}`,
            { direction: 'top', offset: [0, -size / 2], className: 'leaflet-tooltip-custom' }
          );
        marker.on('click', () => setSelected(ac));
        markersRef.current.addLayer(marker);
      }
    });
  }, [aircraft, selected?.hex]);

  // Fetch info + trace when selection changes
  useEffect(() => {
    if (!selected) { setAcInfo(null); setTrace(null); return; }

    // Info
    const cachedInfo = infoCacheRef.current.get(selected.hex);
    if (cachedInfo) { setAcInfo(cachedInfo); }
    else {
      setInfoLoading(true);
      fetch(`/api/adsb/info/${selected.hex}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) { infoCacheRef.current.set(selected.hex, data); setAcInfo(data); } })
        .catch(() => {})
        .finally(() => setInfoLoading(false));
    }

    // Trace (flight path)
    fetch(`/api/adsb/trace/${selected.hex}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setTrace(data); })
      .catch(() => {});
  }, [selected?.hex]);

  // Draw flight path on map when trace changes
  useEffect(() => {
    if (!leafletMap.current || !traceLayerRef.current) return;
    import('leaflet').then((L) => {
      traceLayerRef.current.clearLayers();
      if (!trace?.trace?.length) return;

      // Only show last 30 minutes of the flight path
      const now = Date.now() / 1000;
      const cutoff = now - 30 * 60; // 30 minutes ago
      const recentTrace = trace.trace.filter((t) => t.ts > cutoff);
      if (recentTrace.length < 2) return;

      const points: [number, number][] = recentTrace.map((t) => [t.lat, t.lon]);

      // Flight path polyline with gradient-like effect (older = more transparent)
      const polyline = L.polyline(points, {
        color: '#10b981',
        weight: 3,
        opacity: 0.9,
      });
      traceLayerRef.current.addLayer(polyline);

      // Start of recent path marker
      const startIcon = L.divIcon({ className: '', html: '<div style="width:8px;height:8px;background:#10b981;border-radius:50%;opacity:0.5"></div>', iconSize: [8, 8], iconAnchor: [4, 4] });
      traceLayerRef.current.addLayer(L.marker(points[0], { icon: startIcon, interactive: false }));

      // Don't auto-zoom — the selectAircraft handler already pans to the aircraft
    });
  }, [trace]);

  const startTracking = async () => {
    try { await fetch('/api/adsb/start', { method: 'POST' }); setIsTracking(true); } catch {}
  };

  const stopTracking = async () => {
    try { await fetch('/api/adsb/stop', { method: 'POST' }); } catch {}
    setIsTracking(false);
    setAircraft([]);
    setSelected(null);
  };

  const selectAircraft = useCallback((ac: Aircraft) => {
    setSelected(ac);
    // Pan map to aircraft if it has position
    if (ac.lat && ac.lon && leafletMap.current) {
      leafletMap.current.setView([ac.lat, ac.lon], 10, { animate: true });
    }
  }, []);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">ADS-B Tracker</h2>
            <p className="text-xs text-muted font-mono mt-0.5">1090 MHz &middot; R820T &middot; planespotters.live enrichment</p>
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

      {/* Map */}
      <div className="card p-0 overflow-hidden rounded-lg" style={{ height: '400px' }}>
        <div ref={mapRef} className="w-full h-full" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Aircraft list */}
        <div className="lg:col-span-2 card p-0 max-h-[400px] overflow-y-auto">
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
                  <th className="text-right py-2 px-3 font-medium">Seen</th>
                </tr>
              </thead>
              <tbody>
                {aircraft.map((ac) => (
                  <tr
                    key={ac.hex}
                    onClick={() => selectAircraft(ac)}
                    className={`cursor-pointer transition-colors border-b border-white/[0.03] hover:bg-white/[0.02] ${
                      selected?.hex === ac.hex ? 'bg-emerald-500/5' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-mono font-medium text-secondary">{ac.flight || '—'}</td>
                    <td className="py-2 px-3 font-mono text-muted text-xs">{ac.hex}</td>
                    <td className="py-2 px-3 text-right font-mono">{ac.altitude !== null ? (ac.altitude === 0 ? 'GND' : ac.altitude.toLocaleString()) : '—'}</td>
                    <td className="py-2 px-3 text-right font-mono">{ac.speed ?? '—'}</td>
                    <td className="py-2 px-3 text-right font-mono">{ac.heading ? `${ac.heading}°` : '—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-muted">{ac.squawk || '—'}</td>
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
        <div className="card p-5 max-h-[400px] overflow-y-auto">
          <span className="label mb-3 block">{selected ? 'Aircraft Detail' : 'Select Aircraft'}</span>
          {selected ? (
            <div className="space-y-3">
              {/* Photo */}
              {acInfo?.photo && (
                <a href={acInfo.photoLink || '#'} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={acInfo.photo} alt={acInfo.registration || selected.hex} className="w-full rounded-lg border border-white/[0.06] mb-1" />
                  {acInfo.photographer && <p className="text-2xs text-faint text-right">© {acInfo.photographer}</p>}
                </a>
              )}
              {infoLoading && <p className="text-xs text-muted animate-pulse">Loading...</p>}

              {/* Airline branding */}
              {acInfo?.airlineLogo && acInfo?.owner && (
                <div className="flex items-center gap-2 card-inner p-2">
                  <img src={acInfo.airlineLogo} alt={acInfo.owner} className="h-5 w-auto" />
                  <span className="text-xs font-medium text-secondary">{acInfo.owner}</span>
                </div>
              )}

              {/* Identity */}
              <InfoRow label="Callsign" value={selected.flight || '—'} highlight />
              {acInfo?.registration && <InfoRow label="Reg" value={acInfo.registration} />}
              <InfoRow label="Hex" value={selected.hex} />
              {acInfo?.type && <InfoRow label="Type" value={acInfo.type} />}

              {/* Telemetry */}
              <div className="pt-2 border-t border-white/[0.04]">
                <InfoRow label="Alt" value={selected.altitude !== null ? (selected.altitude === 0 ? 'Ground' : `${selected.altitude.toLocaleString()} ft`) : '—'} />
                <InfoRow label="Speed" value={selected.speed ? `${selected.speed} kts` : '—'} />
                <InfoRow label="Heading" value={selected.heading ? `${selected.heading}°` : '—'} />
                <InfoRow label="V/S" value={selected.verticalRate ? `${selected.verticalRate > 0 ? '+' : ''}${selected.verticalRate} ft/m` : '—'} />
                <InfoRow label="Squawk" value={selected.squawk || '—'} />
                <InfoRow label="Position" value={selected.lat && selected.lon ? `${selected.lat.toFixed(4)}, ${selected.lon.toFixed(4)}` : '—'} />
              </div>

              {/* Trace info */}
              {trace && trace.trace.length > 0 && (
                <div className="pt-2 border-t border-white/[0.04]">
                  <InfoRow label="Track Points" value={String(trace.trace.length)} />
                  {trace.operator && <InfoRow label="Operator" value={trace.operator} />}
                  {trace.description && <InfoRow label="Aircraft" value={trace.description} />}
                </div>
              )}

              {/* Links */}
              <div className="pt-2 border-t border-white/[0.04] flex flex-wrap gap-2">
                <a href={`https://radar.planespotters.net/?icao=${selected.hex}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-bright hover:underline">Live Radar ↗</a>
                <a href={`https://globe.adsbexchange.com/?icao=${selected.hex}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-bright hover:underline">ADSBx ↗</a>
                {acInfo?.registration && <a href={`https://www.flightradar24.com/data/aircraft/${acInfo.registration.toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-bright hover:underline">FR24 ↗</a>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Click an aircraft in the table or on the map.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className={`font-mono text-sm ${highlight ? 'text-emerald-400 font-semibold' : 'text-secondary'}`}>{value}</span>
    </div>
  );
}

export default ADSBTracker;
