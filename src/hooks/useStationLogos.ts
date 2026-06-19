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
 * TV network logos - fetched dynamically from multiple sources:
 * 1. HDHomeRun guide API includes ImageURL per channel
 * 2. Logo.dev free API: https://img.logo.dev/{domain} (no key for basic use)
 * 3. Static fallback map for major networks
 */
export const tvNetworkLogos: Record<string, string> = {
  'ABC': 'https://img.logo.dev/abc.com?format=png&size=64',
  'CBS': 'https://img.logo.dev/cbs.com?format=png&size=64',
  'NBC': 'https://img.logo.dev/nbc.com?format=png&size=64',
  'FOX': 'https://img.logo.dev/fox.com?format=png&size=64',
  'PBS': 'https://img.logo.dev/pbs.org?format=png&size=64',
  'CW': 'https://img.logo.dev/cwtv.com?format=png&size=64',
  'Univision': 'https://img.logo.dev/univision.com?format=png&size=64',
  'Telemundo': 'https://img.logo.dev/telemundo.com?format=png&size=64',
  'ION': 'https://img.logo.dev/iontelevision.com?format=png&size=64',
  'MyNetwork': 'https://img.logo.dev/mynetworktv.com?format=png&size=64',
};

// Map channel names/callsigns to their website domains for Logo.dev lookup
const stationDomains: Record<string, string> = {
  'KTVK': 'azfamily.com',
  'KPHO': 'azfamily.com',
  'KNXV': 'abc15.com',
  'KPNX': '12news.com',
  'KSAZ': 'fox10phoenix.com',
  'KASW': 'azfamily.com',
  'KAET': 'azpbs.org',
  'KUTP': 'myfoxphoenix.com',
  'KTVW': 'univision.com',
  'KTAZ': 'telemundoarizona.com',
};

/** Get a TV station logo URL by callsign or channel name */
export function getTVStationLogo(nameOrCallsign: string): string | null {
  // Check if we have a known domain for this station
  const upper = nameOrCallsign.toUpperCase().replace(/-.*$/, '');
  const domain = stationDomains[upper];
  if (domain) {
    return `https://img.logo.dev/${domain}?format=png&size=64`;
  }

  // Try matching against network names
  for (const [network, url] of Object.entries(tvNetworkLogos)) {
    if (nameOrCallsign.toUpperCase().includes(network.toUpperCase())) {
      return url;
    }
  }

  return null;
}
