import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findAssetByTicker } from "@/lib/assetService";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { ticker?: string; notes?: string };

  if (!body.ticker) {
    return NextResponse.json({ error: "Field `ticker` wajib diisi." }, { status: 400 });
  }

  const asset = await findAssetByTicker(body.ticker);
  if (!asset) {
    return NextResponse.json(
      { error: `${body.ticker} tidak ada di universe MVP (lihat src/lib/universe.ts).` },
      { status: 404 },
    );
  }

  const item = await prisma.watchlistItem.upsert({
    where: { assetId: asset.id },
    create: { assetId: asset.id, notes: body.notes ?? null },
    update: { notes: body.notes ?? undefined },
  });

  return NextResponse.json({ ok: true, id: item.id, ticker: asset.ticker });
}
