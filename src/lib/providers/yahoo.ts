import { fetchJson, RateLimiter } from "./http";
import type { Freshness } from "../types";

/**
 * Yahoo Finance chart endpoint — dipakai untuk harga saham AS, saham IDX (.JK),
 * dan emas (GLD / GC=F).
 *
 * PRD §4 mencatat ini endpoint TIDAK RESMI: tanpa SLA, bisa berubah sewaktu-waktu,
 * tanpa jaminan rate limit. Konsekuensinya di kode ini:
 *   1. limiter agresif (1 request / 1,2 detik) supaya tidak diblokir,
 *   2. semua kegagalan dikembalikan sebagai null, tidak melempar ke atas —
 *      job lanjut ke ticker berikutnya dan data lama tetap ditandai stale,
 *   3. freshness dilabeli `delayed_15m`, bukan `realtime`, karena kita memang
 *      tidak bisa menjamin kesegarannya (PRD §4: dilarang mengklaim real-time).
 */

const limiter = new RateLimiter(1200);
const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const YAHOO_SOURCE = "yahoo_finance_chart";
export const YAHOO_FRESHNESS: Freshness = "delayed_15m";

export interface Bar {
  timestamp: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface YahooChart {
  symbol: string;
  currency: string | null;
  exchangeName: string | null;
  regularMarketPrice: number | null;
  previousClose: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  bars: Bar[];
}

interface RawChartResponse {
  chart: {
    error: { code: string; description: string } | null;
    result:
      | {
          meta: Record<string, unknown>;
          timestamp?: number[];
          indicators: {
            quote?: {
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
              volume?: (number | null)[];
            }[];
          };
        }[]
      | null;
  };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * @param range contoh: "1mo" | "6mo" | "1y" | "2y" | "5y"
 * @param interval contoh: "1d" | "1wk"
 */
export async function fetchChart(
  symbol: string,
  range = "1y",
  interval = "1d",
): Promise<YahooChart | null> {
  const url = `${BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;

  let raw: RawChartResponse;
  try {
    raw = await fetchJson<RawChartResponse>(url, { provider: "yahoo", limiter });
  } catch {
    return null;
  }

  const result = raw.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta ?? {};
  const quote = result.indicators?.quote?.[0] ?? {};
  const stamps = result.timestamp ?? [];

  const bars: Bar[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const close = num(quote.close?.[i]);
    // Bar tanpa close tidak berguna untuk indikator apa pun — dibuang, bukan diisi 0.
    if (close === null) continue;
    bars.push({
      timestamp: new Date(stamps[i] * 1000),
      open: num(quote.open?.[i]),
      high: num(quote.high?.[i]),
      low: num(quote.low?.[i]),
      close,
      volume: num(quote.volume?.[i]),
    });
  }

  return {
    symbol: String(meta.symbol ?? symbol),
    currency: typeof meta.currency === "string" ? meta.currency : null,
    exchangeName: typeof meta.fullExchangeName === "string" ? meta.fullExchangeName : null,
    regularMarketPrice: num(meta.regularMarketPrice) ?? bars.at(-1)?.close ?? null,
    previousClose: num(meta.chartPreviousClose) ?? num(meta.previousClose),
    fiftyTwoWeekHigh: num(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(meta.fiftyTwoWeekLow),
    bars,
  };
}

/**
 * Profil bisnis (saham AS/IDX, emas) — endpoint quoteSummary, BEDA dari chart
 * endpoint di atas: sejak 2024-an Yahoo mewajibkan pasangan cookie+crumb untuk
 * endpoint ini, kalau tidak selalu menolak dengan "Invalid Crumb". Cookie dan
 * crumb sama untuk semua simbol dalam satu proses job, jadi diambil sekali lalu
 * dipakai ulang — bukan tiap panggilan.
 */
let crumbCache: { cookie: string; crumb: string } | null = null;

async function getCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  if (crumbCache) return crumbCache;
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    const setCookie = cookieRes.headers.get("set-cookie");
    if (!setCookie) return null;
    const cookie = setCookie.split(";")[0];

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<")) return null;

    crumbCache = { cookie, crumb };
    return crumbCache;
  } catch {
    return null;
  }
}

export interface YahooProfile {
  description: string | null;
  industry: string | null;
  website: string | null;
  country: string | null;
  employees: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

export async function fetchProfile(symbol: string): Promise<YahooProfile | null> {
  const auth = await getCrumb();
  if (!auth) return null;

  const url =
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=assetProfile&crumb=${encodeURIComponent(auth.crumb)}`;

  let raw: {
    quoteSummary?: {
      result?: { assetProfile?: Record<string, unknown> }[] | null;
      error?: { code?: string } | null;
    };
  };
  try {
    raw = await limiter.run(async () => {
      const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: auth.cookie } });
      // Crumb bisa kedaluwarsa di tengah job (mis. proses berjalan lama lintas
      // hari) — buang cache supaya panggilan berikutnya mengambil yang baru.
      if (res.status === 401) crumbCache = null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
  } catch {
    return null;
  }

  const profile = raw.quoteSummary?.result?.[0]?.assetProfile;
  if (!profile) return null;

  return {
    description: str(profile.longBusinessSummary),
    industry: str(profile.industry) ?? str(profile.sector),
    website: str(profile.website),
    country: str(profile.country),
    employees: int(profile.fullTimeEmployees),
  };
}
