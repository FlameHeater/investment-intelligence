import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildScoringContext, buildSnapshot, findAssetByTicker } from "@/lib/assetService";
import { computeScore } from "@/lib/scoring/orchestrator";
import { generateReasoning } from "@/lib/ai/reasoningGenerator";
import { aiEnabled } from "@/lib/ai/client";
import { getActiveMode } from "@/lib/settings";

/**
 * POST /api/assets/:ticker/score/refresh
 *
 * Menghitung ulang skor deterministik, lalu (kalau ANTHROPIC_API_KEY ada)
 * meminta AI Reasoning. Dua tahap ini sengaja dipisah statusnya di respons:
 * skor bisa berhasil sementara reasoning gagal, dan pengguna berhak tahu
 * yang mana yang berhasil.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const asset = await findAssetByTicker(decodeURIComponent(ticker));

  if (!asset) {
    return NextResponse.json({ error: `Aset ${ticker} tidak ditemukan.` }, { status: 404 });
  }

  const skipAi = new URL(request.url).searchParams.get("skipAi") === "1";
  const mode = await getActiveMode();

  const [ctx, snapshot] = await Promise.all([
    buildScoringContext(asset),
    buildSnapshot(asset),
  ]);
  const result = computeScore(ctx, mode);

  let reasoning = null;
  let reasoningError: string | null = null;

  if (!skipAi && aiEnabled()) {
    try {
      const news = await prisma.news.findMany({
        where: { assetId: asset.id },
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: {
          title: true,
          source: true,
          sourceType: true,
          sentiment: true,
          publishedAt: true,
        },
      });
      reasoning = await generateReasoning(snapshot, result, news);
    } catch (err) {
      reasoningError = (err as Error).message;
    }
  } else if (!aiEnabled()) {
    reasoningError =
      "ANTHROPIC_API_KEY belum diisi, jadi AI Reasoning tidak dibuat. Skor deterministik di bawah tetap valid dan dihitung penuh.";
  }

  const saved = await prisma.analysisScore.create({
    data: {
      assetId: asset.id,
      investmentMode: mode,
      fundamentalScore: result.breakdown.fundamental.score,
      technicalScore: result.breakdown.technical.score,
      valuationScore: result.breakdown.valuation.score,
      sentimentScore: result.breakdown.sentiment.score,
      riskScore: result.breakdown.risk.score,
      overallScore: result.overallScore,
      confidence: result.confidence,
      breakdownJson: JSON.stringify({
        breakdown: result.breakdown,
        effectiveWeights: result.effectiveWeights,
        warnings: result.warnings,
      }),
      reasoningJson: reasoning ? JSON.stringify(reasoning) : null,
      reasoningAt: reasoning ? new Date() : null,
    },
  });

  return NextResponse.json({
    ok: true,
    scoreId: saved.id,
    mode,
    overall: result.overallScore,
    confidence: result.confidence,
    warnings: result.warnings,
    reasoning,
    reasoningError,
  });
}
