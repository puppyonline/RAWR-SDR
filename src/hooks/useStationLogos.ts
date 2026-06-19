import { useState, useEffect } from 'react';

const logoCache: Record<string, string | null> = {};

/**
 * Hook to fetch radio station logos from the server API.
 * Caches results in memory to avoid repeated lookups.
 */
export function useStationLogo(callsign: string): string | null {
  const [logo, setLogo] = useState<string | null>(logoCache[callsign] ?? null);

  useEffect(() => {
    if (!callsign) return;
    if (logoCache[callsign] !== undefined) {
      setLogo(logoCache[callsign]);
      return;
    }

    let cancelled = false;
    fetch(`/api/logos/radio/${encodeURIComponent(callsign)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled) return;
        const url = data?.logo || null;
        logoCache[callsign] = url;
        setLogo(url);
      })
      .catch(() => {
        logoCache[callsign] = null;
        setLogo(null);
      });

    return () => { cancelled = true; };
  }, [callsign]);

  return logo;
}

/**
 * Batch fetch logos for multiple stations.
 * Returns a map of callsign -> logo URL.
 */
export function useStationLogos(callsigns: string[]): Record<string, string | null> {
  const [logos, setLogos] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (callsigns.length === 0) return;

    // Check what we already have cached
    const needed = callsigns.filter((c) => logoCache[c] === undefined);
    const cached: Record<string, string | null> = {};
    callsigns.forEach((c) => {
      if (logoCache[c] !== undefined) cached[c] = logoCache[c];
    });

    if (needed.length === 0) {
      setLogos(cached);
      return;
    }

    fetch(`/api/logos/radio/batch?stations=${needed.join(',')}`)
      .then((res) => res.ok ? res.json() : {})
      .then((data: Record<string, string | null>) => {
        Object.entries(data).forEach(([k, v]) => { logoCache[k] = v; });
        setLogos({ ...cached, ...data });
      })
      .catch(() => setLogos(cached));
  }, [callsigns.join(',')]);

  return logos;
}

/**
 * TV network logos - uses Hunter.io's free Logo API (no key, no signup needed)
 * Format: https://logos.hunter.io/{domain}
 * Returns high-quality company logos as PNG images.
 */
export const tvNetworkLogos: Record<string, string> = {
  'ABC': 'https://logos.hunter.io/abc.com',
  'CBS': 'https://logos.hunter.io/cbs.com',
  'NBC': 'https://logos.hunter.io/nbc.com',
  'FOX': 'https://logos.hunter.io/fox.com',
  'PBS': 'https://logos.hunter.io/pbs.org',
  'CW': 'https://logos.hunter.io/cwtv.com',
  'Univision': 'https://logos.hunter.io/univision.com',
  'Telemundo': 'https://logos.hunter.io/telemundo.com',
  'ION': 'https://logos.hunter.io/iontelevision.com',
  'MyNetwork': 'https://logos.hunter.io/mynetworktv.com',
};

// Map channel names/callsigns to their website domains for logo lookup
const stationDomains: Record<string, string> = {
  'KTVK': 'azfamily.com',
  'KPHO': 'azfamily.com',
  'KNXV': 'abc15.com',
  'KPNX': '12news.com',
  'KSAZ': 'fox10phoenix.com',
  'KASW': 'azfamily.com',
  'KAET': 'azpbs.org',
  'KUTP': 'fox10phoenix.com',
  'KTVW': 'univision.com',
  'KTAZ': 'telemundo.com',
};

/** Get a TV station logo URL by callsign or channel name */
export function getTVStationLogo(nameOrCallsign: string): string | null {
  const upper = nameOrCallsign.toUpperCase().replace(/-.*$/, '');
  const domain = stationDomains[upper];
  if (domain) {
    return `https://logos.hunter.io/${domain}`;
  }

  // Try matching against network names
  for (const [network, url] of Object.entries(tvNetworkLogos)) {
    if (nameOrCallsign.toUpperCase().includes(network.toUpperCase())) {
      return url;
    }
  }

  return null;
}
