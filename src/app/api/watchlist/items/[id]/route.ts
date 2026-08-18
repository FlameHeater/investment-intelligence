import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Boleh menerima id baris watchlist maupun ticker, supaya UI tidak perlu
  // menyimpan id internal hanya untuk menghapus.
  const deleted = await prisma.watchlistItem.deleteMany({
    where: { OR: [{ id }, { asset: { ticker: id.toUpperCase() } }] },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Item tidak ditemukan di watchlist." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
