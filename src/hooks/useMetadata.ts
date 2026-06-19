import { useState, useEffect, useRef } from 'react';

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
  const lastQuery = useRef('');

  useEffect(() => {
    if (!artist && !title) {
      setMeta(null);
      return;
    }

    const queryKey = `${artist || ''}|${title || ''}|${station || ''}`;
    if (queryKey === lastQuery.current) return;
    lastQuery.current = queryKey;

    // Check client cache
    const cached = getClientCached<NowPlayingMeta>(`np:${queryKey}`);
    if (cached) {
      setMeta(cached);
      return;
    }

    const params = new URLSearchParams();
    if (artist) params.set('artist', artist);
    if (title) params.set('title', title);
    if (station) params.set('station', station);

    let cancelled = false;
    fetch(`/api/metadata/nowplaying?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
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
  const lastTitle = useRef('');

  useEffect(() => {
    if (!showTitle) {
      setInfo(null);
      return;
    }

    // Normalize: strip common suffixes like "New", year tags, etc.
    const normalized = showTitle.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (normalized === lastTitle.current) return;
    lastTitle.current = normalized;

    // Check client cache
    const cached = getClientCached<TVShowInfo>(`tv:${normalized.toLowerCase()}`);
    if (cached) {
      setInfo(cached);
      return;
    }

    let cancelled = false;
    fetch(`/api/metadata/tv/show?title=${encodeURIComponent(normalized)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        setClientCache(`tv:${normalized.toLowerCase()}`, data);
        setInfo(data);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [showTitle]);

  return info;
}

// ─── Hook: useWikiSummary ──────────────────────────────────────────────────
// Generic Wikipedia summary lookup

export function useWikiSummary(query: string | undefined): WikiSummary | null {
  const [summary, setSummary] = useState<WikiSummary | null>(null);
  const lastQuery = useRef('');

  useEffect(() => {
    if (!query) {
      setSummary(null);
      return;
    }

    if (query === lastQuery.current) return;
    lastQuery.current = query;

    const cached = getClientCached<WikiSummary>(`wiki:${query.toLowerCase()}`);
    if (cached) {
      setSummary(cached);
      return;
    }

    let cancelled = false;
    fetch(`/api/metadata/wiki?q=${encodeURIComponent(query)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        setClientCache(`wiki:${query.toLowerCase()}`, data);
        setSummary(data);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [query]);

  return summary;
}
