import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/client";
import { explain } from "@/lib/ai/educationAgent";
import { GLOSSARY } from "@/lib/metrics";

/**
 * POST /api/chat/explain — Contextual Education (PRD §5 poin 8).
 *
 * Tanpa ANTHROPIC_API_KEY, endpoint ini TIDAK gagal: ia mengembalikan definisi
 * statis dari glosarium. Fitur belajar tetap berguna walau lapisan AI mati.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    term?: string;
    question?: string;
    context?: Record<string, string | number | null>;
  };

  if (!body.term && !body.question) {
    return NextResponse.json({ error: "Kirim `term` atau `question`." }, { status: 400 });
  }

  const fallback = body.term ? GLOSSARY[body.term] : undefined;

  if (!aiEnabled()) {
    return NextResponse.json({
      answer:
        fallback ??
        "Penjelasan mendalam butuh ANTHROPIC_API_KEY. Definisi singkat untuk istilah ini belum tersedia di glosarium bawaan.",
      source: "glossary",
      aiEnabled: false,
    });
  }

  try {
    const answer = await explain(body);
    return NextResponse.json({ answer, source: "claude", aiEnabled: true });
  } catch (err) {
    return NextResponse.json(
      {
        answer: fallback ?? null,
        source: "glossary",
        aiEnabled: true,
        error: (err as Error).message,
      },
      { status: fallback ? 200 : 500 },
    );
  }
}
