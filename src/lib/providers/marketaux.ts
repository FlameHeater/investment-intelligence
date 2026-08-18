import { fetchJson, RateLimiter } from "./http";
import { classifySource, type NewsItem } from "./finnhub";

/**
 * Marketaux — berita multi-aset (PRD §4, free tier 100 request/hari, 3 artikel/request).
 *
 * Kuota harian sangat kecil, jadi provider ini SENGAJA hanya dipakai untuk aset
 * di watchlist (lihat jobs/refreshNews.ts), bukan seluruh universe. Untuk saham AS
 * di luar watchlist, Finnhub yang jauh lebih longgar limitnya yang dipakai.
 */

const limiter = new RateLimiter(1500);
const BASE = "https://api.marketaux.com/v1/news/all";

export const MARKETAUX_SOURCE = "marketaux";

export const marketauxEnabled = () => Boolean(process.env.MARKETAUX_API_KEY);

interface RawResponse {
  data?: {
    title: string;
    description: string | null;
    url: string;
    source: string;
    published_at: string;
  }[];
}

export async function fetchNewsForSymbols(symbols: string[]): Promise<NewsItem[]> {
  if (!marketauxEnabled() || symbols.length === 0) return [];

  const url =
    `${BASE}?api_token=${process.env.MARKETAUX_API_KEY}` +
    `&symbols=${encodeURIComponent(symbols.join(","))}` +
    `&filter_entities=true&language=en,id&limit=3`;

  let raw: RawResponse;
  try {
    raw = await fetchJson<RawResponse>(url, { provider: "marketaux", limiter });
  } catch {
    return [];
  }

  return (raw.data ?? []).map((n) => ({
    title: n.title,
    source: n.source,
    sourceType: classifySource(n.source),
    url: n.url,
    summary: n.description,
    publishedAt: new Date(n.published_at),
  }));
}
