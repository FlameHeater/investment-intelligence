import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findAssetByTicker } from "@/lib/assetService";

const RANGE_DAYS: Record<string, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
  "2y": 730,
  max: 3650,
};

/** GET /api/assets/:ticker/price?range=1y → OHLC untuk chart (PRD §10). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const range = new URL(request.url).searchParams.get("range") ?? "1y";
  const days = RANGE_DAYS[range] ?? 365;

  const asset = await findAssetByTicker(decodeURIComponent(ticker));
  if (!asset) {
    return NextResponse.json({ error: `Aset ${ticker} tidak ditemukan.` }, { status: 404 });
  }

  const bars = await prisma.marketData.findMany({
    where: { assetId: asset.id, timestamp: { gte: new Date(Date.now() - days * 86_400_000) } },
    orderBy: { timestamp: "asc" },
    select: {
      timestamp: true,
      open: true,
      high: true,
      low: true,
      close: true,
      volume: true,
      source: true,
      freshness: true,
    },
  });

  return NextResponse.json({
    ticker: asset.ticker,
    currency: asset.currency,
    range,
    // Bar tanpa OHLC lengkap (mis. kripto dari CoinGecko) dikirim apa adanya —
    // klien yang memutuskan menampilkannya sebagai garis, bukan candle.
    bars: bars.map((b) => ({
      time: Math.floor(b.timestamp.getTime() / 1000),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    })),
    hasOhlc: bars.some((b) => b.open !== null && b.high !== null && b.low !== null),
    source: bars.at(-1)?.source ?? null,
    freshness: bars.at(-1)?.freshness ?? null,
  });
}
