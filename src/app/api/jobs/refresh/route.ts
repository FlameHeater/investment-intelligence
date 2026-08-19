import { NextResponse } from "next/server";
import {
  getRefreshState,
  refreshMode,
  refreshModeExplanation,
  startRefresh,
} from "@/lib/refreshOrchestrator";
import type { AssetScope } from "@/lib/refreshJobs";

const VALID_SCOPES: AssetScope[] = ["us", "idx", "crypto", "gold"];

/** GET → status refresh saat ini + mode yang berlaku di deployment ini. */
export async function GET() {
  return NextResponse.json({
    mode: refreshMode(),
    explanation: refreshModeExplanation(),
    state: getRefreshState(),
  });
}

/** POST → mulai refresh. Body opsional: { only: ["us","crypto"] } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { only?: string[] };

  const only = body.only?.filter((s): s is AssetScope =>
    VALID_SCOPES.includes(s as AssetScope),
  );

  const result = await startRefresh(only?.length ? only : undefined);

  return NextResponse.json(
    { ...result, state: getRefreshState(), explanation: refreshModeExplanation() },
    { status: result.started ? 202 : 409 },
  );
}
