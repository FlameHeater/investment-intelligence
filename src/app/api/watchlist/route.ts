import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildSnapshot, type AssetRow } from "@/lib/assetService";
import { getActiveMode } from "@/lib/settings";

/** GET /api/watchlist → daftar pantauan + kondisi terkini tiap aset. */
export async function GET() {
  const mode = await getActiveMode();
  const items = await prisma.watchlistItem.findMany({
    include: { asset: true },
    orderBy: { addedAt: "desc" },
  });

  const rows = await Promise.all(
    items.map(async (item) => {
      const snapshot = await buildSnapshot(item.asset as AssetRow);
      const scores = await prisma.analysisScore.findMany({
        where: { assetId: item.assetId, investmentMode: mode },
        orderBy: { createdAt: "desc" },
        take: 2,
      });

      return {
        id: item.id,
        ticker: item.asset.ticker,
        name: item.asset.name,
        assetType: item.asset.assetType,
        currency: item.asset.currency,
        notes: item.notes,
        addedAt: item.addedAt,
        price: snapshot.technical.price,
        change1d: snapshot.technical.change1d,
        change30d: snapshot.technical.change30d,
        stale: snapshot.stale,
        freshness: snapshot.freshness,
        lastPriceAt: snapshot.lastPriceAt,
        score: scores[0]?.overallScore ?? null,
        confidence: scores[0]?.confidence ?? null,
        // Selisih terhadap skor sebelumnya — inti dari "Smart Watchlist":
        // yang penting bukan angkanya, tapi perubahannya.
        scoreDelta:
          scores.length === 2 ? scores[0].overallScore - scores[1].overallScore : null,
      };
    }),
  );

  return NextResponse.json({ mode, count: rows.length, items: rows });
}
