import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/client";
import { parseNaturalQuery, summarizeScreenerResult } from "@/lib/ai/screenerParser";
import { runScreener } from "@/lib/screener";
import { getActiveMode } from "@/lib/settings";

/**
 * POST /api/screener/ai — Fase 6 PRD.
 *
 * Alur: bahasa natural → Claude menghasilkan filter → filter dijalankan mesin
 * screener yang SAMA dengan Advanced Screener → Claude meringkas hasilnya.
 * Filter mentah ikut dikembalikan supaya pengguna bisa memeriksa dan mengoreksi
 * terjemahan model, bukan hanya menerima hasilnya.
 */
export async function POST(request: Request) {
  if (!aiEnabled()) {
    return NextResponse.json(
      {
        error:
          "AI Screener butuh ANTHROPIC_API_KEY atau GEMINI_API_KEY. Advanced Screener manual tetap bisa dipakai tanpa itu.",
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { query?: string };
  const query = body.query?.trim();

  if (!query || query.length < 3) {
    return NextResponse.json({ error: "Tuliskan permintaan minimal 3 karakter." }, { status: 400 });
  }
  if (query.length > 500) {
    return NextResponse.json({ error: "Permintaan terlalu panjang (maksimal 500 karakter)." }, { status: 400 });
  }

  const mode = await getActiveMode();

  try {
    const parsed = await parseNaturalQuery(query);
    const result = await runScreener(parsed.query, mode);

    let summary: string | null = null;
    let summaryError: string | null = null;
    try {
      summary = await summarizeScreenerResult(query, parsed, result);
    } catch (err) {
      // Ringkasan gagal tidak boleh menghilangkan hasil screening yang sudah benar.
      summaryError = (err as Error).message;
    }

    return NextResponse.json({
      interpretation: parsed.interpretation,
      unsupported: parsed.unsupported,
      query: parsed.query,
      result,
      summary,
      summaryError,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
