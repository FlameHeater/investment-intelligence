import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** GET /api/assets/search?q= → pencarian ticker/nama di universe (PRD §10). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const results = await prisma.asset.findMany({
    where: {
      OR: [{ ticker: { contains: q.toUpperCase() } }, { name: { contains: q } }],
    },
    take: 15,
    orderBy: { ticker: "asc" },
    select: { ticker: true, name: true, assetType: true, currency: true, sector: true },
  });

  return NextResponse.json({ results });
}
