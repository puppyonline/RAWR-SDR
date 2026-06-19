/**
 * Local news aggregator for Phoenix/Mesa area.
 * Fetches RSS feeds from local TV stations and parses to JSON.
 * No API key needed - uses public RSS endpoints.
 */

import { Router, Request, Response } from 'express';
import https from 'https';
import http from 'http';

const router = Router();

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category?: string;
  image?: string;
}

// Local Phoenix news RSS feeds
const feeds = [
  { url: 'https://www.12news.com/feeds/syndication/rss/news/local', source: '12News (KPNX)', category: 'Local' },
  { url: 'https://www.azcentral.com/arcio/rss/category/news/local/phoenix/?query=displaypromo:1+AND+type:story&sort=InitialPublishDate%20desc', source: 'AZ Central', category: 'Local' },
  { url: 'https://www.abc15.com/feeds/rssFeed?obType=articles&parentId=news/region-phoenix-metro', source: 'ABC15 (KNXV)', category: 'Metro' },
  { url: 'https://www.fox10phoenix.com/feeds/rss/fox-10-digital/news/arizona', source: 'FOX 10 (KSAZ)', category: 'Arizona' },
];

let cachedNews: NewsItem[] = [];
let lastFetch = 0;
const CACHE_MS = 10 * 60 * 1000; // 10 min cache

/**
 * Parse basic RSS XML to extract items.
 * Handles RSS 2.0 format (title, link, description, pubDate, media:content).
 */
function parseRSS(xml: string, source: string, category: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const description = extractTag(itemXml, 'description');
    const pubDate = extractTag(itemXml, 'pubDate');
    const image = extractMediaUrl(itemXml);

    if (title && link) {
      items.push({
        title: cleanHtml(title),
        link,
        description: cleanHtml(description || '').slice(0, 200),
        pubDate: pubDate || '',
        source,
        category,
        image: image || undefined,
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'));
  if (cdataMatch) return cdataMatch[1].trim();

  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

function extractMediaUrl(xml: string): string | null {
  // Try media:content, media:thumbnail, or enclosure
  const mediaMatch = xml.match(/url="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);
  return mediaMatch ? mediaMatch[1] : null;
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 8000, headers: { 'User-Agent': 'Airwave/1.0 NewsReader' } }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function refreshNews(): Promise<NewsItem[]> {
  const now = Date.now();
  if (cachedNews.length > 0 && (now - lastFetch) < CACHE_MS) {
    return cachedNews;
  }

  const results: NewsItem[] = [];

  // Fetch all feeds in parallel
  const promises = feeds.map(async (feed) => {
    try {
      const xml = await fetchUrl(feed.url);
      const items = parseRSS(xml, feed.source, feed.category);
      return items.slice(0, 10); // max 10 per feed
    } catch {
      return [];
    }
  });

  const allItems = await Promise.all(promises);
  allItems.forEach((items) => results.push(...items));

  // Sort by date (newest first)
  results.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime() || 0;
    const dateB = new Date(b.pubDate).getTime() || 0;
    return dateB - dateA;
  });

  cachedNews = results.slice(0, 30); // keep top 30
  lastFetch = now;
  console.log(`[News] Fetched ${cachedNews.length} articles from ${feeds.length} sources`);
  return cachedNews;
}

// GET /api/news
router.get('/', async (_req: Request, res: Response) => {
  try {
    const news = await refreshNews();
    res.json(news);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/news/weather (placeholder for future weather integration)
router.get('/weather', (_req: Request, res: Response) => {
  res.json({
    location: 'Mesa, AZ',
    temp: null,
    conditions: null,
    message: 'Weather integration coming soon',
  });
});

export default router;

// Pre-fetch news on startup
setTimeout(() => refreshNews(), 2000);
