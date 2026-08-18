import { fetchJson, RateLimiter } from "./http";
import type { Freshness } from "../types";
import type { Bar } from "./yahoo";

/**
 * CoinGecko public API — sumber harga & market data kripto (PRD §4).
 * Tanpa key: ~5-15 calls/menit. Dengan Demo key gratis: 30 calls/menit.
 * Limiter menyesuaikan otomatis berdasarkan ada/tidaknya COINGECKO_API_KEY.
 */

const hasKey = () => Boolean(process.env.COINGECKO_API_KEY);
const limiter = new RateLimiter(hasKey() ? 2200 : 6500);

const BASE = "https://api.coingecko.com/api/v3";

export const COINGECKO_SOURCE = "coingecko";
export const COINGECKO_FRESHNESS: Freshness = "delayed_15m";

function authHeaders(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-demo-api-key": key } : {};
}

export interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number | null;
  marketCap: number | null;
  totalVolume: number | null;
  high24h: number | null;
  low24h: number | null;
  priceChangePct24h: number | null;
  ath: number | null;
  atl: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
}

interface RawMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  high_24h: number | null;
  low_24h: number | null;
  price_change_percentage_24h: number | null;
  ath: number | null;
  atl: number | null;
  circulating_supply: number | null;
  max_supply: number | null;
}

/** Satu panggilan mengembalikan sampai 250 coin — hemat kuota dibanding per-coin. */
export async function fetchTopCoins(perPage = 100, page = 1): Promise<CoinMarket[]> {
  const url =
    `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc` +
    `&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h`;

  let raw: RawMarket[];
  try {
    raw = await fetchJson<RawMarket[]>(url, { provider: "coingecko", limiter, headers: authHeaders() });
  } catch {
    return [];
  }

  return raw.map((c) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    currentPrice: c.current_price,
    marketCap: c.market_cap,
    totalVolume: c.total_volume,
    high24h: c.high_24h,
    low24h: c.low_24h,
    priceChangePct24h: c.price_change_percentage_24h,
    ath: c.ath,
    atl: c.atl,
    circulatingSupply: c.circulating_supply,
    maxSupply: c.max_supply,
  }));
}

interface RawChart {
  prices: [number, number][];
  total_volumes: [number, number][];
}

/**
 * Riwayat harga harian. CoinGecko free tier hanya memberi close (tanpa OHLC penuh
 * di endpoint ini), jadi open/high/low dibiarkan null alih-alih dikarang dari close.
 */
export async function fetchCoinHistory(coinId: string, days = 365): Promise<Bar[]> {
  const url = `${BASE}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}&interval=daily`;

  let raw: RawChart;
  try {
    raw = await fetchJson<RawChart>(url, { provider: "coingecko", limiter, headers: authHeaders() });
  } catch {
    return [];
  }

  const volumeByTs = new Map(raw.total_volumes?.map(([t, v]) => [t, v]) ?? []);
  return (raw.prices ?? []).map(([ts, price]) => ({
    timestamp: new Date(ts),
    open: null,
    high: null,
    low: null,
    close: price,
    volume: volumeByTs.get(ts) ?? null,
  }));
}
