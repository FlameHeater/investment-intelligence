import { NextResponse } from "next/server";
import { getOverview } from "@/lib/overview";
import { getActiveMode } from "@/lib/settings";

/** GET /api/dashboard/overview (PRD §10). Sepenuhnya dari cache DB. */
export async function GET() {
  const mode = await getActiveMode();
  return NextResponse.json(await getOverview(mode));
}
