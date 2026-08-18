"use client";

import { useState } from "react";
import { Loader2, MessageCircleQuestion } from "lucide-react";
import { Card } from "@/components/ui";

const EXAMPLES = [
  "Apa bedanya PER dan PBV?",
  "Kenapa RSI tinggi tidak otomatis berarti harus jual?",
  "Apa artinya confidence rendah pada sebuah skor?",
  "Kenapa saham IDX di aplikasi ini tidak punya data fundamental?",
];

export function AskAnything({ aiAvailable }: { aiAvailable: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (question.trim().length < 3) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/chat/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      setAnswer(data.answer ?? data.error ?? "Tidak ada jawaban.");
    } catch {
      setAnswer("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <label htmlFor="ask" className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <MessageCircleQuestion size={16} aria-hidden="true" />
        Tanya apa saja soal istilah keuangan
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="ask"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && ask()}
          disabled={!aiAvailable}
          placeholder={
            aiAvailable
              ? "mis. apa itu debt to equity dan berapa yang wajar?"
              : "Butuh ANTHROPIC_API_KEY di .env"
          }
          className="h-11 flex-1 rounded border border-line bg-bg px-3 text-base outline-none transition-colors focus:border-info disabled:opacity-50"
        />
        <button
          type="button"
          onClick={ask}
          disabled={loading || !aiAvailable || question.trim().length < 3}
          className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded bg-accent px-5 font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          Tanya
        </button>
      </div>

      {aiAvailable && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {EXAMPLES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuestion(q)}
              className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {!aiAvailable && (
        <p className="mt-2 text-xs text-fg-subtle">
          Glosarium metrik di bawah halaman ini tetap tersedia penuh tanpa API key.
        </p>
      )}

      {answer && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 whitespace-pre-line rounded border border-line bg-surface-2 p-4 text-sm leading-relaxed text-fg-muted"
        >
          {answer}
        </div>
      )}
    </Card>
  );
}
