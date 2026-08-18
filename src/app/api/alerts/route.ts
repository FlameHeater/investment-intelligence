import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { findAssetByTicker } from "@/lib/assetService";

export async function GET() {
  const alerts = await prisma.alert.findMany({
    include: { asset: { select: { ticker: true, name: true, currency: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      ticker: a.asset.ticker,
      name: a.asset.name,
      currency: a.asset.currency,
      alertType: a.alertType,
      condition: JSON.parse(a.conditionJson),
      active: a.active,
      lastTriggeredAt: a.lastTriggeredAt,
    })),
  });
}

const bodySchema = z.object({
  ticker: z.string().min(1),
  alertType: z.enum(["price", "score_change", "news", "fundamental_change"]),
  condition: z.object({
    operator: z.enum(["gt", "lt"]),
    value: z.number(),
  }),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }

  const asset = await findAssetByTicker(parsed.data.ticker);
  if (!asset) {
    return NextResponse.json({ error: `${parsed.data.ticker} tidak ditemukan.` }, { status: 404 });
  }

  const alert = await prisma.alert.create({
    data: {
      assetId: asset.id,
      alertType: parsed.data.alertType,
      conditionJson: JSON.stringify(parsed.data.condition),
    },
  });

  return NextResponse.json({ ok: true, id: alert.id });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Parameter `id` wajib diisi." }, { status: 400 });

  await prisma.alert.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
