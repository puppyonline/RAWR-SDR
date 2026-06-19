/**
 * Unified metadata service for Airwave.
 * Aggregates data from multiple free, no-key APIs:
 *
 * - TVmaze: TV show details, cast, episodes, images
 * - iTunes Search: Album art + track metadata
 * - MusicBrainz: Artist/recording metadata
 * - Cover Art Archive: Album artwork via MusicBrainz IDs
 * - Wikipedia REST API: Summaries for stations, artists, shows
 * - Radio-Browser.info: Extended station details
 *
 * All APIs used here require NO API key.
 */

import { Router, Request, Response } from 'express';
import https from 'https';
import http from 'http';

const router = Router();

// ─── Shared Utilities ──────────────────────────────────────────────────────

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min default
const SHORT_CACHE = 10 * 60 * 1000; // 10 min for volatile data

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data;
  if (entry) cache.delete(key);
  return null;
}

function setCache(key: string, data: any, ttl = CACHE_TTL) {
  cache.set(key, { data, expires: Date.now() + ttl });
  // Evict old entries periodically
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expires < now) cache.delete(k);
    }
  }
}

function fetchJSON(url: string, userAgent = 'Airwave/2.0 (local media hub)'): Promise<any> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = {
      timeout: 8000,
      headers: { 'User-Agent': userAgent, 'Accept': 'application/json' },
    };
    mod.get(url, opts, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJSON(res.headers.location, userAgent).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

// ─── TVmaze: TV Show Information ───────────────────────────────────────────

interface TVShowInfo {
  id: number;
  name: string;
  summary: string | null;
  genres: string[];
  rating: number | null;
  image: string | null;
  network: string | null;
  runtime: number | null;
  premiered: string | null;
  status: string | null;
  url: string | null;
  cast: Array<{ name: string; character: string; image: string | null }>;
}

async function lookupTVShow(title: string): Promise<TVShowInfo | null> {
  const cacheKey = `tvmaze:${title.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    // Search for the show
    const searchUrl = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}&embed=cast`;
    const show = await fetchJSON(searchUrl);
    if (!show || !show.id) return null;

    const result: TVShowInfo = {
      id: show.id,
      name: show.name,
      summary: show.summary ? show.summary.replace(/<[^>]+>/g, '').trim() : null,
      genres: show.genres || [],
      rating: show.rating?.average || null,
      image: show.image?.medium || show.image?.original || null,
      network: show.network?.name || show.webChannel?.name || null,
      runtime: show.runtime || show.averageRuntime || null,
      premiered: show.premiered || null,
      status: show.status || null,
      url: show.url || null,
      cast: (show._embedded?.cast || []).slice(0, 6).map((c: any) => ({
        name: c.person?.name || '',
        character: c.character?.name || '',
        image: c.person?.image?.medium || null,
      })),
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// GET /api/metadata/tv/show?title=Breaking+Bad
router.get('/tv/show', async (req: Request, res: Response) => {
  const title = req.query.title as string;
  if (!title) return res.status(400).json({ error: 'title param required' });

  // Try TVmaze first
  const info = await lookupTVShow(title);
  if (info) return res.json(info);

  // Fallback: try Zeam for local shows
  const zeamInfo = await lookupZeamShow(title);
  if (zeamInfo) return res.json(zeamInfo);

  res.status(404).json({ error: 'Show not found' });
});

// ─── Zeam: Local Show Metadata (scraped from embedded JSON) ────────────────

// Known Phoenix-area local shows and their Zeam publisher slugs
const zeamLocalShows: Record<string, string> = {
  'your life arizona': '/publishers/1216/your-life-arizona-from-ktvk',
  'good morning arizona': '/publishers/1215/good-morning-arizona-from-ktvk',
  '12 news': '/publishers/1217/12-news-from-kpnx',
  'arizona midday': '/publishers/1218/arizona-midday-from-12-news',
  'abc15 mornings': '/publishers/1219/abc15-mornings',
  'abc15 arizona': '/publishers/1220/abc15-arizona',
  'sonoran living': '/publishers/1221/sonoran-living-from-abc15',
};

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Airwave/2.0)' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function lookupZeamShow(title: string): Promise<TVShowInfo | null> {
  const cacheKey = `zeam:${title.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  // Find matching Zeam publisher by fuzzy matching show title
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  let slug: string | null = null;

  for (const [key, value] of Object.entries(zeamLocalShows)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      slug = value;
      break;
    }
  }

  // Also try matching by partial words
  if (!slug) {
    const words = normalized.split(/\s+/);
    for (const [key, value] of Object.entries(zeamLocalShows)) {
      const keyWords = key.split(/\s+/);
      const matchCount = words.filter((w) => keyWords.some((kw) => kw.includes(w) || w.includes(kw))).length;
      if (matchCount >= 2) {
        slug = value;
        break;
      }
    }
  }

  if (!slug) {
    setCache(cacheKey, null, SHORT_CACHE);
    return null;
  }

  try {
    const html = await fetchText(`https://zeam.com${slug}`);

    // Extract the embedded JSON from: var json={...};
    const jsonMatch = html.match(/var\s+json\s*=\s*(\{[\s\S]*?\});\s*\n/);
    if (!jsonMatch) {
      setCache(cacheKey, null, SHORT_CACHE);
      return null;
    }

    const data = JSON.parse(jsonMatch[1]);
    const publisherGroup = data?.configurableTab?.pages ? null :
      (data?.publisher?.publisherGroups || []).find((g: any) => g.publisher || g.show);

    const publisher = publisherGroup?.publisher || data?.publisher?.publisherGroups?.[0]?.publisher;
    const show = publisherGroup?.show || data?.publisher?.publisherGroups?.[1]?.show;

    const description = publisher?.description || show?.description || null;
    const name = publisher?.name || show?.name || title;

    // Get the best image
    let image: string | null = null;
    const images = publisher?.images || show?.images || [];
    const heroImage = images.find((img: any) => img.typeId === 1044 && parseInt(img.size) >= 640);
    const thumbImage = images.find((img: any) => img.typeId === 1034 && parseInt(img.size) >= 400);
    const anyImage = images.find((img: any) => img.url);
    const imgData = heroImage || thumbImage || anyImage;
    if (imgData?.url) {
      image = imgData.url.startsWith('http') ? imgData.url : `https://${imgData.url}`;
    }

    const result: TVShowInfo = {
      id: publisher?.publisherId || show?.showId || 0,
      name,
      summary: description,
      genres: ['Local', 'Lifestyle'],
      rating: null,
      image,
      network: 'Local (Zeam)',
      runtime: show?.runTime ? Math.round(show.runTime / 60) : null,
      premiered: null,
      status: 'Running',
      url: `https://zeam.com${slug}`,
      cast: [],
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    setCache(cacheKey, null, SHORT_CACHE);
    return null;
  }
}

// ─── iTunes Search: Track Info + Album Art ─────────────────────────────────

interface TrackInfo {
  artist: string;
  track: string;
  album: string | null;
  albumArt: string | null;
  albumArtLarge: string | null;
  genre: string | null;
  releaseDate: string | null;
  previewUrl: string | null;
  trackTimeMillis: number | null;
}

async function lookupTrack(artist: string, track: string): Promise<TrackInfo | null> {
  const cacheKey = `itunes:${artist.toLowerCase()}:${track.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const query = encodeURIComponent(`${artist} ${track}`);
    const url = `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=3`;
    const data = await fetchJSON(url);

    if (!data?.results?.length) return null;

    // Find best match (prefer exact artist match)
    const match = data.results.find((r: any) =>
      r.artistName.toLowerCase().includes(artist.toLowerCase())
    ) || data.results[0];

    const result: TrackInfo = {
      artist: match.artistName,
      track: match.trackName,
      album: match.collectionName || null,
      albumArt: match.artworkUrl100 || null,
      albumArtLarge: match.artworkUrl100
        ? match.artworkUrl100.replace('100x100bb', '600x600bb')
        : null,
      genre: match.primaryGenreName || null,
      releaseDate: match.releaseDate || null,
      previewUrl: match.previewUrl || null,
      trackTimeMillis: match.trackTimeMillis || null,
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// GET /api/metadata/track?artist=Foo+Fighters&title=Everlong
router.get('/track', async (req: Request, res: Response) => {
  const artist = req.query.artist as string;
  const title = req.query.title as string;
  if (!artist && !title) return res.status(400).json({ error: 'artist and/or title required' });

  const info = await lookupTrack(artist || '', title || '');
  if (!info) return res.status(404).json({ error: 'Track not found' });
  res.json(info);
});

// ─── MusicBrainz: Artist Metadata ─────────────────────────────────────────

interface ArtistInfo {
  name: string;
  type: string | null;
  country: string | null;
  beginYear: string | null;
  endYear: string | null;
  genres: string[];
  disambiguation: string | null;
  mbid: string;
}

async function lookupArtist(name: string): Promise<ArtistInfo | null> {
  const cacheKey = `mb:artist:${name.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(name)}&fmt=json&limit=3`;
    const data = await fetchJSON(url, 'Airwave/2.0 (alexxwm@github.com)');

    if (!data?.artists?.length) return null;

    const artist = data.artists[0];
    const result: ArtistInfo = {
      name: artist.name,
      type: artist.type || null,
      country: artist.country || artist.area?.name || null,
      beginYear: artist['life-span']?.begin || null,
      endYear: artist['life-span']?.end || null,
      genres: (artist.tags || []).slice(0, 5).map((t: any) => t.name),
      disambiguation: artist.disambiguation || null,
      mbid: artist.id,
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// GET /api/metadata/artist?name=Foo+Fighters
router.get('/artist', async (req: Request, res: Response) => {
  const name = req.query.name as string;
  if (!name) return res.status(400).json({ error: 'name param required' });

  const info = await lookupArtist(name);
  if (!info) return res.status(404).json({ error: 'Artist not found' });
  res.json(info);
});

// ─── Cover Art Archive: Album Artwork via MusicBrainz ──────────────────────

async function lookupAlbumArt(artist: string, album: string): Promise<string | null> {
  const cacheKey = `caa:${artist.toLowerCase()}:${album.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    // First find the release in MusicBrainz
    const query = encodeURIComponent(`artist:${artist} AND release:${album}`);
    const url = `https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json&limit=1`;
    const data = await fetchJSON(url, 'Airwave/2.0 (alexxwm@github.com)');

    if (!data?.releases?.length) return null;

    const mbid = data.releases[0].id;
    // Cover Art Archive URL (redirects to actual image)
    const artUrl = `https://coverartarchive.org/release/${mbid}/front-250`;

    setCache(cacheKey, artUrl);
    return artUrl;
  } catch {
    return null;
  }
}

// GET /api/metadata/albumart?artist=Foo+Fighters&album=The+Colour+and+the+Shape
router.get('/albumart', async (req: Request, res: Response) => {
  const artist = req.query.artist as string;
  const album = req.query.album as string;
  if (!artist || !album) return res.status(400).json({ error: 'artist and album required' });

  const url = await lookupAlbumArt(artist, album);
  if (!url) return res.status(404).json({ error: 'Album art not found' });
  res.json({ url });
});

// ─── Wikipedia: Summaries for Anything ─────────────────────────────────────

interface WikiSummary {
  title: string;
  extract: string;
  description: string | null;
  thumbnail: string | null;
  url: string;
}

/**
 * Lookup a Wikipedia summary. If context is provided, validates that the
 * returned article is relevant (e.g. actually about a TV station, not the
 * generic word "weather" or "comet").
 */
async function lookupWikipedia(query: string, context?: 'tv_station' | 'artist' | 'general'): Promise<WikiSummary | null> {
  const cacheKey = `wiki:${query.toLowerCase()}:${context || ''}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  // For TV station lookups, try multiple disambiguated titles
  const titlesToTry: string[] = [];
  if (context === 'tv_station') {
    // Try specific TV-related disambiguations first
    titlesToTry.push(query); // Direct callsign (e.g., "KTVK" — most stations have pages by callsign)
    titlesToTry.push(`${query} TV`); // e.g., "Cozi TV", "Ion TV"
    titlesToTry.push(`${query}-TV`); // e.g., "KSAZ-TV"
    titlesToTry.push(`${query} (TV channel)`);
    titlesToTry.push(`${query} (TV network)`);
    titlesToTry.push(`${query} (American TV channel)`);
  } else {
    titlesToTry.push(query);
  }

  for (const rawTitle of titlesToTry) {
    try {
      const title = encodeURIComponent(rawTitle.replace(/ /g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
      const data = await fetchJSON(url);

      if (!data || data.type === 'not_found' || !data.extract) continue;

      // Relevance check for TV station context
      if (context === 'tv_station') {
        const desc = (data.description || '').toLowerCase();
        const extract = (data.extract || '').toLowerCase();
        const combined = desc + ' ' + extract;

        // Must mention TV, channel, network, broadcast, television, or station
        const tvKeywords = ['television', 'tv ', 'tv channel', 'network', 'broadcast', 'station', 'cable', 'streaming'];
        const isRelevant = tvKeywords.some((kw) => combined.includes(kw));
        if (!isRelevant) continue;
      }

      const result: WikiSummary = {
        title: data.title,
        extract: data.extract.slice(0, 500),
        description: data.description || null,
        thumbnail: data.thumbnail?.source || null,
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${title}`,
      };

      setCache(cacheKey, result);
      return result;
    } catch {
      continue;
    }
  }

  // Nothing relevant found
  setCache(cacheKey, null, SHORT_CACHE);
  return null;
}

// GET /api/metadata/wiki?q=KNIX+(FM)&context=tv_station
router.get('/wiki', async (req: Request, res: Response) => {
  const q = req.query.q as string;
  const context = req.query.context as 'tv_station' | 'artist' | 'general' | undefined;
  if (!q) return res.status(400).json({ error: 'q param required' });

  const info = await lookupWikipedia(q, context);
  if (!info) return res.status(404).json({ error: 'No Wikipedia article found' });
  res.json(info);
});

// ─── Radio-Browser.info: Extended Station Details ──────────────────────────

interface RadioStationFull {
  name: string;
  callsign: string;
  country: string;
  state: string | null;
  language: string | null;
  tags: string[];
  codec: string | null;
  bitrate: number | null;
  homepage: string | null;
  favicon: string | null;
  votes: number;
  geo: { lat: number; lon: number } | null;
}

async function lookupRadioStation(callsign: string): Promise<RadioStationFull | null> {
  const cacheKey = `radiobrowser:${callsign.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const url = `https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(callsign)}?limit=5&order=votes&reverse=true`;
    const data = await fetchJSON(url);

    if (!Array.isArray(data) || data.length === 0) return null;

    // Find best match
    const station = data.find((s: any) =>
      s.name.toUpperCase().includes(callsign.toUpperCase())
    ) || data[0];

    const result: RadioStationFull = {
      name: station.name,
      callsign,
      country: station.country || '',
      state: station.state || null,
      language: station.language || null,
      tags: (station.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean).slice(0, 8),
      codec: station.codec || null,
      bitrate: station.bitrate || null,
      homepage: station.homepage || null,
      favicon: station.favicon || null,
      votes: station.votes || 0,
      geo: station.geo_lat && station.geo_long
        ? { lat: station.geo_lat, lon: station.geo_long }
        : null,
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// GET /api/metadata/station?callsign=KNIX
router.get('/station', async (req: Request, res: Response) => {
  const callsign = req.query.callsign as string;
  if (!callsign) return res.status(400).json({ error: 'callsign param required' });

  const info = await lookupRadioStation(callsign);
  if (!info) return res.status(404).json({ error: 'Station not found' });
  res.json(info);
});

// ─── Combined: Rich "Now Playing" for Radio ────────────────────────────────
// Single endpoint that fetches track info + album art in one call

// GET /api/metadata/nowplaying?artist=Foo+Fighters&title=Everlong&station=KUPD
router.get('/nowplaying', async (req: Request, res: Response) => {
  const artist = req.query.artist as string;
  const title = req.query.title as string;
  const station = req.query.station as string;

  const results: Record<string, any> = {};

  // Parallel fetches
  const promises: Promise<void>[] = [];

  if (artist && title) {
    promises.push(
      lookupTrack(artist, title).then((info) => { results.track = info; })
    );
  }

  if (artist) {
    promises.push(
      lookupArtist(artist).then((info) => { results.artist = info; })
    );
    promises.push(
      lookupWikipedia(artist).then((info) => { results.artistWiki = info; })
    );
  }

  if (station) {
    promises.push(
      lookupWikipedia(`${station} (FM)`).then((info) => {
        if (!info) return lookupWikipedia(station).then((i) => { results.stationWiki = i; });
        results.stationWiki = info;
      })
    );
  }

  await Promise.allSettled(promises);

  // Fallback: if no track found, treat RDS text as possible ad/company
  // Try to extract a brand name and look it up
  if (!results.track && (artist || title)) {
    const adInfo = await lookupAdvertiser(artist, title);
    if (adInfo) {
      results.advertiser = adInfo;
    }
  }

  res.json(results);
});

// ─── Advertiser/Company Detection from RDS Ad Text ─────────────────────────

interface AdvertiserInfo {
  name: string;
  description: string | null;
  extract: string | null;
  thumbnail: string | null;
  url: string | null;
  logo: string | null;
}

async function lookupAdvertiser(artist: string | undefined, title: string | undefined): Promise<AdvertiserInfo | null> {
  // Combine available text
  const rawText = [artist, title].filter(Boolean).join(' ');
  if (!rawText || rawText.length < 3) return null;

  const cacheKey = `ad:${rawText.toLowerCase().slice(0, 50)}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  // Try to extract a brand/company name from RDS ad text
  const brandName = extractBrandName(rawText);
  if (!brandName) {
    setCache(cacheKey, null, SHORT_CACHE);
    return null;
  }

  try {
    // Look up the brand on Wikipedia
    const wiki = await lookupWikipedia(brandName);
    if (!wiki) {
      // Try with "company" disambiguation
      const wikiCompany = await lookupWikipedia(`${brandName} (company)`);
      if (!wikiCompany) {
        setCache(cacheKey, null, SHORT_CACHE);
        return null;
      }
      const result: AdvertiserInfo = {
        name: wikiCompany.title,
        description: wikiCompany.description,
        extract: wikiCompany.extract,
        thumbnail: wikiCompany.thumbnail,
        url: wikiCompany.url,
        logo: `https://logo.clearbit.com/${brandName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
      };
      setCache(cacheKey, result);
      return result;
    }

    const result: AdvertiserInfo = {
      name: wiki.title,
      description: wiki.description,
      extract: wiki.extract,
      thumbnail: wiki.thumbnail,
      url: wiki.url,
      logo: `https://logo.clearbit.com/${brandName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    setCache(cacheKey, null, SHORT_CACHE);
    return null;
  }
}

/**
 * Extract a likely brand/company name from RDS ad text.
 * RDS ads typically contain: brand names, phone numbers, URLs, slogans.
 * We try to find the most "brand-like" token.
 */
function extractBrandName(text: string): string | null {
  // Clean up: remove phone numbers, URLs, common ad words
  let cleaned = text
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '') // phone numbers
    .replace(/\b\d{5}\b/g, '') // zip codes
    .replace(/https?:\/\/\S+/gi, '') // URLs
    .replace(/www\.\S+/gi, '') // www URLs
    .replace(/\.(com|net|org|io)\b/gi, '') // domain TLDs
    .replace(/\b(call|text|visit|now|today|free|save|off|sale|win|enter|at|the|and|or|for|your|our|get|with|from)\b/gi, '')
    .replace(/[#@!$%&*()_+=\[\]{}|\\/<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length < 2) return null;

  // Look for capitalized words (likely brand names)
  const words = cleaned.split(' ').filter((w) => w.length >= 2);

  // Try multi-word brand (first 2-3 capitalized consecutive words)
  const capitalWords = words.filter((w) => /^[A-Z]/.test(w));
  if (capitalWords.length >= 1) {
    // Use the longest capitalized sequence
    const brand = capitalWords.slice(0, 3).join(' ');
    if (brand.length >= 3 && brand.length <= 30) return brand;
  }

  // Fallback: use the longest word that looks like a name
  const candidates = words
    .filter((w) => w.length >= 3 && /^[A-Z]/.test(w))
    .sort((a, b) => b.length - a.length);

  return candidates[0] || null;
}

export default router;
