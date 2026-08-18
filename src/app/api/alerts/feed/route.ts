import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** GET /api/alerts/feed → riwayat kejadian + penjelasan AI (PRD §10). */
export async function GET(request: Request) {
  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 50), 200);

  const events = await prisma.alertEvent.findMany({
    include: { asset: { select: { ticker: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    count: events.length,
    events: events.map((e) => ({
      id: e.id,
      ticker: e.asset.ticker,
      name: e.asset.name,
      eventType: e.eventType,
      title: e.title,
      detail: e.detail,
      explanation: e.explanation,
      severity: e.severity,
      readAt: e.readAt,
      createdAt: e.createdAt,
    })),
  });
}

/** Menandai semua kejadian sudah dibaca. */
export async function POST() {
  const { count } = await prisma.alertEvent.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, marked: count });
}
