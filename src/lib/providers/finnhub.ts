import { fetchJson, RateLimiter } from "./http";
import { classifySource } from "./sourceType";
import type { SourceType } from "../types";

/**
 * Finnhub — fundamental & berita saham AS (PRD §4, free tier 60 calls/menit).
 *
 * OPSIONAL: kalau FINNHUB_API_KEY kosong, semua fungsi mengembalikan hasil kosong.
 * Aplikasi tetap jalan, hanya saja saham AS ikut kehilangan dimensi fundamental —
 * dan itu ditampilkan apa adanya di UI, bukan ditutupi dengan angka default.
 */

const limiter = new RateLimiter(1100);
const BASE = "https://finnhub.io/api/v1";

export const FINNHUB_SOURCE = "finnhub";

export const finnhubEnabled = () => Boolean(process.env.FINNHUB_API_KEY);

function withKey(path: string): string {
  return `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${process.env.FINNHUB_API_KEY}`;
}

/** Metrik yang kita ambil, dipetakan ke nama internal (lihat lib/metrics.ts). */
const METRIC_MAP: Record<string, string> = {
  roeRfy: "roe",
  netProfitMarginTTM: "net_margin",
  grossMarginTTM: "gross_margin",
  "totalDebt/totalEquityQuarterly": "debt_to_equity",
  currentRatioQuarterly: "current_ratio",
  revenueGrowthTTMYoy: "revenue_growth",
  epsGrowthTTMYoy: "eps_growth",
  epsTTM: "eps",
  peTTM: "per",
  pbQuarterly: "pbv",
  currentDividendYieldTTM: "dividend_yield",
  beta: "beta",
  marketCapitalization: "market_cap",
};

export interface MetricRow {
  metric: string;
  value: number;
}

export async function fetchMetrics(symbol: string): Promise<MetricRow[]> {
  if (!finnhubEnabled()) return [];

  let raw: { metric?: Record<string, unknown> };
  try {
    raw = await fetchJson(withKey(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`), {
      provider: "finnhub",
      limiter,
    });
  } catch {
    return [];
  }

  const out: MetricRow[] = [];
  for (const [finnhubKey, internalKey] of Object.entries(METRIC_MAP)) {
    const v = raw.metric?.[finnhubKey];
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push({ metric: internalKey, value: v });
    }
  }
  return out;
}

export interface NewsItem {
  title: string;
  source: string;
  sourceType: SourceType;
  url: string;
  summary: string | null;
  publishedAt: Date;
}

interface RawNews {
  headline: string;
  source: string;
  url: string;
  summary: string;
  datetime: number;
}

export async function fetchCompanyNews(symbol: string, days = 7): Promise<NewsItem[]> {
  if (!finnhubEnabled()) return [];

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let raw: RawNews[];
  try {
    raw = await fetchJson(
      withKey(`/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}`),
      { provider: "finnhub", limiter },
    );
  } catch {
    return [];
  }

  return (raw ?? [])
    .filter((n) => n.headline && n.url)
    .slice(0, 20)
    .map((n) => ({
      title: n.headline,
      source: n.source ?? "Unknown",
      sourceType: classifySource(n.source ?? ""),
      url: n.url,
      summary: n.summary || null,
      publishedAt: new Date(n.datetime * 1000),
    }));
}

export { classifySource };
