import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { screenerQuerySchema } from "@/lib/screener";
import { getActiveMode } from "@/lib/settings";

export async function GET() {
  const saved = await prisma.savedScreener.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    saved: saved.map((s) => ({
      id: s.id,
      name: s.name,
      investmentMode: s.investmentMode,
      createdAt: s.createdAt,
      query: JSON.parse(s.filtersJson),
    })),
  });
}

const bodySchema = z.object({
  name: z.string().min(1).max(80),
  query: screenerQuerySchema,
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const created = await prisma.savedScreener.create({
    data: {
      name: parsed.data.name,
      filtersJson: JSON.stringify(parsed.data.query),
      investmentMode: await getActiveMode(),
    },
  });

  return NextResponse.json({ ok: true, id: created.id });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Parameter `id` wajib diisi." }, { status: 400 });

  await prisma.savedScreener.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
