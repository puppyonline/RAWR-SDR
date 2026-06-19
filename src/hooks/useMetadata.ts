import { useState, useEffect } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TrackInfo {
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

export interface ArtistInfo {
  name: string;
  type: string | null;
  country: string | null;
  beginYear: string | null;
  endYear: string | null;
  genres: string[];
  disambiguation: string | null;
  mbid: string;
}

export interface WikiSummary {
  title: string;
  extract: string;
  description: string | null;
  thumbnail: string | null;
  url: string;
}

export interface NowPlayingMeta {
  track: TrackInfo | null;
  artist: ArtistInfo | null;
  artistWiki: WikiSummary | null;
  stationWiki: WikiSummary | null;
}

export interface TVShowInfo {
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

// ─── In-memory client cache ────────────────────────────────────────────────

const clientCache = new Map<string, { data: any; ts: number }>();
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 min client-side

function getClientCached<T>(key: string): T | null {
  const entry = clientCache.get(key);
  if (entry && Date.now() - entry.ts < CLIENT_CACHE_TTL) return entry.data as T;
  return null;
}

function setClientCache(key: string, data: any) {
  clientCache.set(key, { data, ts: Date.now() });
}

// ─── Hook: useNowPlayingMeta ───────────────────────────────────────────────
// Fetches combined track/artist/wiki info when RDS provides artist+title

export function useNowPlayingMeta(
  artist: string | undefined,
  title: string | undefined,
  station: string | undefined
): NowPlayingMeta | null {
  const [meta, setMeta] = useState<NowPlayingMeta | null>(null);

  useEffect(() => {
    if (!artist && !title) {
      setMeta(null);
      return;
    }

    const queryKey = `${artist || ''}|${title || ''}|${station || ''}`;
    const cacheKey = `np:${queryKey}`;

    // Check client cache
    const cached = getClientCached<NowPlayingMeta>(cacheKey);
    if (cached) {
      setMeta(cached);
      return;
    }

    // Clear previous metadata immediately when query changes
    setMeta(null);

    const params = new URLSearchParams();
    if (artist) params.set('artist', artist);
    if (title) params.set('title', title);
    if (station) params.set('station', station);

    let cancelled = false;
    fetch(`/api/metadata/nowplaying?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return;
        if (!data) { setMeta(null); return; }
        const result: NowPlayingMeta = {
          track: data.track || null,
          artist: data.artist || null,
          artistWiki: data.artistWiki || null,
          stationWiki: data.stationWiki || null,
        };
        setClientCache(`np:${queryKey}`, result);
        setMeta(result);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [artist, title, station]);

  return meta;
}

// ─── Hook: useTVShowInfo ───────────────────────────────────────────────────
// Fetches TVmaze show info by title

export function useTVShowInfo(showTitle: string | undefined): TVShowInfo | null {
  const [info, setInfo] = useState<TVShowInfo | null>(null);

  useEffect(() => {
    if (!showTitle) {
      setInfo(null);
      return;
    }

    // Normalize: strip common suffixes like "New", year tags, etc.
    const normalized = showTitle.replace(/\s*\(.*?\)\s*/g, '').trim();
    const cacheKey = `tv:${normalized.toLowerCase()}`;

    // Check client cache
    const cached = getClientCached<TVShowInfo>(cacheKey);
    if (cached) {
      setInfo(cached);
      return;
    }

    // Clear previous show info immediately when title changes
    setInfo(null);

    let cancelled = false;
    fetch(`/api/metadata/tv/show?title=${encodeURIComponent(normalized)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setClientCache(cacheKey, data);
        }
        setInfo(data || null);
      })
      .catch(() => { if (!cancelled) setInfo(null); });

    return () => { cancelled = true; };
  }, [showTitle]);

  return info;
}

// ─── Hook: useWikiSummary ──────────────────────────────────────────────────
// Generic Wikipedia summary lookup with optional context for relevance filtering

export function useWikiSummary(query: string | undefined, context?: 'tv_station' | 'artist' | 'general'): WikiSummary | null {
  const [summary, setSummary] = useState<WikiSummary | null>(null);

  useEffect(() => {
    if (!query) {
      setSummary(null);
      return;
    }

    const cacheKey = `wiki:${query}:${context || ''}`.toLowerCase();

    // Check client cache
    const cached = getClientCached<WikiSummary>(cacheKey);
    if (cached) {
      setSummary(cached);
      return;
    }

    // Clear stale data
    setSummary(null);

    let cancelled = false;
    const params = new URLSearchParams({ q: query });
    if (context) params.set('context', context);
    fetch(`/api/metadata/wiki?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setClientCache(cacheKey, data);
        }
        setSummary(data || null);
      })
      .catch(() => { if (!cancelled) setSummary(null); });

    return () => { cancelled = true; };
  }, [query, context]);

  return summary;
}
