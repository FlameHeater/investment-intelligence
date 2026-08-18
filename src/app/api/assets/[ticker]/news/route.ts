import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findAssetByTicker } from "@/lib/assetService";

/** GET /api/assets/:ticker/news (PRD §10). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const asset = await findAssetByTicker(decodeURIComponent(ticker));

  if (!asset) {
    return NextResponse.json({ error: `Aset ${ticker} tidak ditemukan.` }, { status: 404 });
  }

  const news = await prisma.news.findMany({
    where: { assetId: asset.id },
    orderBy: { publishedAt: "desc" },
    take: 30,
    select: {
      title: true,
      source: true,
      sourceType: true,
      url: true,
      summary: true,
      sentiment: true,
      publishedAt: true,
    },
  });

  return NextResponse.json({ ticker: asset.ticker, count: news.length, news });
}
