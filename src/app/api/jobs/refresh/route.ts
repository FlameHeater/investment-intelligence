import { NextResponse } from "next/server";
import {
  advanceRefresh,
  isStalled,
  readState,
  resetRefresh,
  startRefresh,
} from "@/lib/refreshChunked";
import type { AssetScope } from "@/lib/refreshJobs";

/**
 * Refresh dijalankan sebagai rangkaian potongan pendek, bukan satu proses
 * panjang — lihat lib/refreshChunked.ts untuk alasannya. Browser memanggil
 * endpoint ini berulang selama status masih `running`.
 */

// Batas atas eksekusi; anggaran per potongan di dalamnya jauh lebih kecil.
export const maxDuration = 60;

const VALID_SCOPES: AssetScope[] = ["us", "idx", "crypto", "gold"];

export async function GET() {
  const state = await readState();
  return NextResponse.json({ state, stalled: isStalled(state) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: "start" | "advance" | "reset";
    only?: string[];
  };

  const action = body.action ?? "start";

  if (action === "reset") {
    return NextResponse.json({ state: await resetRefresh() });
  }

  if (action === "advance") {
    return NextResponse.json({ state: await advanceRefresh() });
  }

  const only = body.only?.filter((s): s is AssetScope => VALID_SCOPES.includes(s as AssetScope));
  const state = await startRefresh(only?.length ? only : undefined);

  return NextResponse.json({ state }, { status: 202 });
}
