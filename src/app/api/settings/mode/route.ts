import { NextResponse } from "next/server";
import { isInvestmentMode } from "@/lib/modes";
import { getActiveMode, setActiveMode } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ mode: await getActiveMode() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { mode?: string };

  if (!isInvestmentMode(body.mode)) {
    return NextResponse.json(
      { error: "Mode tidak dikenal. Pilihan: beginner, investor, trader, crypto." },
      { status: 400 },
    );
  }

  await setActiveMode(body.mode);
  return NextResponse.json({ ok: true, mode: body.mode });
}
