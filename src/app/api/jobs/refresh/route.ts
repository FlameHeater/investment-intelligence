import { NextResponse } from "next/server";
import {
  advanceRefresh,
  isStalled,
  readState,
  resetRefresh,
  startRefresh,
} from "@/lib/refreshChunked";
import { dispatchConfig, dispatchWorkflow } from "@/lib/refreshDispatch";
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
  return NextResponse.json({
    state,
    stalled: isStalled(state),
    dispatch: dispatchConfig(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: "start" | "advance" | "reset" | "dispatch";
    only?: string[];
  };

  const action = body.action ?? "start";

  if (action === "reset") {
    return NextResponse.json({ state: await resetRefresh() });
  }

  if (action === "advance") {
    return NextResponse.json({ state: await advanceRefresh() });
  }

  // Jalur kedua: serahkan seluruh pekerjaan ke GitHub Actions supaya halaman
  // tidak perlu tetap terbuka.
  if (action === "dispatch") {
    const result = await dispatchWorkflow();
    return NextResponse.json(
      { dispatch: { ...dispatchConfig(), ...result }, state: await readState() },
      { status: result.ok ? 202 : 502 },
    );
  }

  const only = body.only?.filter((s): s is AssetScope => VALID_SCOPES.includes(s as AssetScope));
  const state = await startRefresh(only?.length ? only : undefined);

  return NextResponse.json({ state }, { status: 202 });
}
