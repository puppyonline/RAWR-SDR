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
 * TV network logos - static map of known logos from GitHub tv-logos repo.
 */
export const tvNetworkLogos: Record<string, string> = {
  'ABC': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/abc-us.png',
  'CBS': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/cbs-us.png',
  'NBC': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/nbc-us.png',
  'FOX': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/fox-us.png',
  'PBS': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/pbs-us.png',
  'CW': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/the-cw-us.png',
  'Univision': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/univision-us.png',
  'Telemundo': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/telemundo-us.png',
  'ION': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/ion-television-us.png',
  'MyNetwork': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/mynetworktv-us.png',
};

/** Get a TV network logo URL by network name */
export function getTVLogo(network: string): string | null {
  return tvNetworkLogos[network] || null;
}
