import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildSnapshot, findAssetByTicker } from "@/lib/assetService";
import { getActiveMode } from "@/lib/settings";

/** GET /api/assets/:ticker → detail aset + skor terbaru (PRD §10). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const asset = await findAssetByTicker(decodeURIComponent(ticker));

  if (!asset) {
    return NextResponse.json({ error: `Aset ${ticker} tidak ada di universe MVP.` }, { status: 404 });
  }

  const mode = await getActiveMode();
  const [snapshot, score] = await Promise.all([
    buildSnapshot(asset),
    prisma.analysisScore.findFirst({
      where: { assetId: asset.id, investmentMode: mode },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    asset: {
      ticker: asset.ticker,
      name: asset.name,
      assetType: asset.assetType,
      exchange: asset.exchange,
      currency: asset.currency,
      sector: asset.sector,
    },
    price: {
      last: snapshot.technical.price,
      change1d: snapshot.technical.change1d,
      change30d: snapshot.technical.change30d,
      source: snapshot.source,
      freshness: snapshot.freshness,
      lastPriceAt: snapshot.lastPriceAt,
      stale: snapshot.stale,
    },
    technical: snapshot.technical,
    fundamentals: Object.fromEntries(snapshot.fundamentals),
    fundamentalSource: snapshot.fundamentalSource,
    score: score
      ? {
          mode: score.investmentMode,
          overall: score.overallScore,
          confidence: score.confidence,
          subScores: {
            fundamental: score.fundamentalScore,
            technical: score.technicalScore,
            valuation: score.valuationScore,
            sentiment: score.sentimentScore,
            risk: score.riskScore,
          },
          breakdown: score.breakdownJson ? JSON.parse(score.breakdownJson) : null,
          reasoning: score.reasoningJson ? JSON.parse(score.reasoningJson) : null,
          computedAt: score.createdAt,
        }
      : null,
  });
}
