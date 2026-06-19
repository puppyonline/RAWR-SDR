/**
 * Station logo/branding service.
 *
 * Radio: Uses radio-browser.info free API to find station logos by callsign.
 * TV: Uses well-known network logo URLs from GitHub tv-logos repository.
 */

import { Router, Request, Response } from 'express';
import https from 'https';

const router = Router();

// Cache logos to avoid repeated lookups
const logoCache: Record<string, string> = {};

// TV network logos from tv-logo/tv-logos GitHub repo (raw URLs)
const tvLogos: Record<string, string> = {
  'ABC': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/abc-us.png',
  'CBS': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/cbs-us.png',
  'NBC': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/nbc-us.png',
  'FOX': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/fox-us.png',
  'PBS': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/pbs-us.png',
  'CW': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/the-cw-us.png',
  'Univision': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/univision-us.png',
  'Telemundo': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/telemundo-us.png',
  'MyNetworkTV': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/mynetworktv-us.png',
  'ION': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/ion-television-us.png',
};

// ─── Station domain map for logo lookups (Google Favicons) ─────────────────
// Maps callsigns to their website domains for high-quality favicon logos
const stationDomains: Record<string, string> = {
  // Phoenix FM
  'KBAQ': 'kbaq.org',
  'KJZZ': 'kjzz.org',
  'KTAR': 'ktar.com',
  'KDKB': 'alt933.com',
  'KOOL': 'kfrq.com',
  'KYOT': 'thecoyote955.com',
  'KMXP': 'mix969.com',
  'KUPD': '98kupd.com',
  'KNRJ': 'energia987.com',
  'KESZ': 'kesz.com',
  'KSLX': 'kslx.com',
  'KNIX': 'knix.com',
  'KZON': 'thezonephx.com',
  'KEDJ': 'theedge1039.com',
  'KFYI': 'kfyi.com',
  'KDVA': 'kdva.com',
  'KMLE': 'kmle.com',
  'KMVP': 'arizonasports.com',
  // Phoenix AM
  'KKNT': '960thepatriot.com',
  'KFNN': 'kfnn.com',
  'KGME': 'arizonasports.com',
};

/**
 * Get logo URL for a radio station.
 * Priority: 1) Google Favicon from known domain, 2) radio-browser.info
 */
async function lookupRadioLogo(callsign: string): Promise<string | null> {
  if (logoCache[callsign]) return logoCache[callsign];

  // Try domain-based logo first (instant, no API call)
  const domain = stationDomains[callsign.toUpperCase()];
  if (domain) {
    const logoUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    logoCache[callsign] = logoUrl;
    return logoUrl;
  }

  // Fallback: radio-browser.info lookup
  return new Promise((resolve) => {
    const url = `https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(callsign)}?limit=5`;

    https.get(url, { headers: { 'User-Agent': 'Airwave/2.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const stations = JSON.parse(data);
          const match = stations.find((s: any) =>
            s.favicon && s.name.toUpperCase().includes(callsign.toUpperCase())
          ) || stations.find((s: any) => s.favicon);

          if (match?.favicon) {
            logoCache[callsign] = match.favicon;
            resolve(match.favicon);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// GET /api/logos/radio/:callsign
router.get('/radio/:callsign', async (req: Request, res: Response) => {
  const { callsign } = req.params;
  const logo = await lookupRadioLogo(callsign);
  if (logo) {
    res.json({ callsign, logo });
  } else {
    res.json({ callsign, logo: null });
  }
});

// GET /api/logos/radio/batch?stations=KNIX,KOOL,KUPD
router.get('/radio/batch', async (req: Request, res: Response) => {
  const stations = (req.query.stations as string || '').split(',').filter(Boolean);
  const results: Record<string, string | null> = {};

  await Promise.all(
    stations.map(async (callsign) => {
      results[callsign] = await lookupRadioLogo(callsign);
    })
  );

  res.json(results);
});

// GET /api/logos/tv/:network
router.get('/tv/:network', (req: Request, res: Response) => {
  const { network } = req.params;
  const logo = tvLogos[network] || null;

  // If not in static map, try Logo.dev by domain
  if (!logo) {
    // Try known station domains
    const domains: Record<string, string> = {
      'KTVK': 'azfamily.com',
      'KPHO': 'azfamily.com',
      'KNXV': 'abc15.com',
      'KPNX': '12news.com',
      'KSAZ': 'fox10phoenix.com',
      'KAET': 'azpbs.org',
      'KASW': 'azfamily.com',
    };
    const domain = domains[network.toUpperCase()];
    if (domain) {
      return res.json({ network, logo: `https://img.logo.dev/${domain}?format=png&size=64` });
    }
    return res.status(404).json({ network, logo: null });
  }

  res.json({ network, logo });
});

// GET /api/logos/tv - all TV network logos
router.get('/tv', (_req: Request, res: Response) => {
  res.json(tvLogos);
});

export default router;
