import { NextResponse } from "next/server";
import { runScreener, screenerQuerySchema } from "@/lib/screener";
import { getActiveMode } from "@/lib/settings";

/**
 * GET /api/screener/run?filters=<json>&assetTypes=us_stock,crypto
 * Mesin yang sama dipakai AI Screener (PRD §5 poin 3).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;

  let filters: unknown = [];
  const raw = sp.get("filters");
  if (raw) {
    try {
      filters = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Parameter `filters` bukan JSON valid." }, { status: 400 });
    }
  }

  const parsed = screenerQuerySchema.safeParse({
    assetTypes: sp.get("assetTypes")?.split(",").filter(Boolean) ?? [],
    filters,
    sortBy: sp.get("sortBy") ?? "overall_score",
    sortDir: sp.get("sortDir") === "asc" ? "asc" : "desc",
    limit: Number(sp.get("limit") ?? 50),
    search: sp.get("search") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }

  const result = await runScreener(parsed.data, await getActiveMode());
  return NextResponse.json(result);
}
