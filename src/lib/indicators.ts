/**
 * Indikator teknikal murni — fungsi deterministik tanpa I/O.
 * Semua mengembalikan `null` kalau data historis tidak cukup, BUKAN nilai default.
 * Ini penting supaya orchestrator bisa menurunkan confidence, bukan memberi skor palsu.
 */

export interface Candle {
  close: number;
  high: number | null;
  low: number | null;
  volume: number | null;
  timestamp: Date;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return emaSeries(values, period).at(-1) ?? null;
}

/** RSI Wilder klasik, periode 14. */
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface Macd {
  macd: number;
  signal: number;
  histogram: number;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): Macd | null {
  if (values.length < slow + signalPeriod) return null;

  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);
  const macdSeries = fastSeries.map((v, i) => v - slowSeries[i]);
  const signalSeries = emaSeries(macdSeries, signalPeriod);

  const m = macdSeries.at(-1)!;
  const s = signalSeries.at(-1)!;
  return { macd: m, signal: s, histogram: m - s };
}

/** Volatilitas tahunan dari return harian (dipakai riskScore). */
export function annualizedVolatility(values: number[], lookback = 90): number | null {
  if (values.length < 30) return null;
  const slice = values.slice(-Math.min(lookback, values.length));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] === 0) continue;
    returns.push(slice[i] / slice[i - 1] - 1);
  }
  if (returns.length < 20) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Penurunan terdalam dari puncak, dalam persen (0-1). */
export function maxDrawdown(values: number[]): number | null {
  if (values.length < 30) return null;
  let peak = values[0];
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
  }
  return worst;
}

export function pctChange(values: number[], periods: number): number | null {
  if (values.length <= periods) return null;
  const past = values[values.length - 1 - periods];
  if (!past) return null;
  return (values.at(-1)! / past - 1) * 100;
}

export interface TechnicalSnapshot {
  price: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: Macd | null;
  volatility: number | null;
  maxDrawdown: number | null;
  change1d: number | null;
  change7d: number | null;
  change30d: number | null;
  change90d: number | null;
  high52w: number | null;
  low52w: number | null;
  distanceFromHigh52w: number | null;
  avgVolume30d: number | null;
  /** "uptrend" | "downtrend" | "sideways" | null */
  trend: "uptrend" | "downtrend" | "sideways" | null;
  barCount: number;
}

export function buildTechnicalSnapshot(candles: Candle[]): TechnicalSnapshot {
  const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v));
  const price = closes.at(-1) ?? null;

  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);

  // Jendela 52 minggu ≈ 252 hari bursa.
  const window52w = closes.slice(-252);
  const high52w = window52w.length >= 60 ? Math.max(...window52w) : null;
  const low52w = window52w.length >= 60 ? Math.min(...window52w) : null;

  const volumes = candles
    .slice(-30)
    .map((c) => c.volume)
    .filter((v): v is number => typeof v === "number");
  const avgVolume30d = volumes.length >= 10 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : null;

  let trend: TechnicalSnapshot["trend"] = null;
  if (price !== null && s50 !== null) {
    const reference = s200 ?? s50;
    if (price > s50 && s50 >= reference) trend = "uptrend";
    else if (price < s50 && s50 <= reference) trend = "downtrend";
    else trend = "sideways";
  }

  return {
    price,
    sma20: s20,
    sma50: s50,
    sma200: s200,
    rsi14: rsi(closes),
    macd: macd(closes),
    volatility: annualizedVolatility(closes),
    maxDrawdown: maxDrawdown(closes),
    change1d: pctChange(closes, 1),
    change7d: pctChange(closes, 5),
    change30d: pctChange(closes, 21),
    change90d: pctChange(closes, 63),
    high52w,
    low52w,
    distanceFromHigh52w:
      price !== null && high52w ? ((price - high52w) / high52w) * 100 : null,
    avgVolume30d,
    trend,
    barCount: closes.length,
  };
}
