"use client";

import { useState } from "react";
import { HelpCircle, Loader2, X } from "lucide-react";

/**
 * Contextual Education (PRD §5 poin 8).
 *
 * Definisi singkat muncul langsung dari glosarium lokal — tanpa jaringan, tanpa
 * menunggu. Tombol "Tanya lebih lanjut" barulah memanggil Claude. Urutan ini
 * disengaja: penjelasan dasar harus selalu tersedia walau lapisan AI mati.
 */
export function TermTooltip({
  term,
  label,
  definition,
  context,
}: {
  term: string;
  label: string;
  definition: string;
  context?: Record<string, string | number | null>;
}) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function askMore() {
    setLoading(true);
    try {
      const res = await fetch("/api/chat/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, context }),
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
    <span className="relative inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Penjelasan tentang ${label}`}
        className="cursor-pointer rounded p-0.5 text-fg-subtle transition-colors hover:text-info"
      >
        <HelpCircle size={13} aria-hidden="true" />
      </button>

      {open && (
        <span
          role="dialog"
          aria-label={`Penjelasan ${label}`}
          className="absolute left-0 top-full z-50 mt-1.5 block w-72 rounded border border-line-strong bg-surface p-3 text-left shadow-xl"
        >
          <span className="mb-1.5 flex items-start justify-between gap-2">
            <span className="text-sm font-medium">{label}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup penjelasan"
              className="cursor-pointer rounded p-0.5 text-fg-subtle hover:text-fg"
            >
              <X size={13} />
            </button>
          </span>

          <span className="block text-xs leading-relaxed text-fg-muted">{definition}</span>

          {answer ? (
            <span className="mt-2.5 block border-t border-line pt-2.5 text-xs leading-relaxed text-fg-muted">
              {answer}
            </span>
          ) : (
            <button
              type="button"
              onClick={askMore}
              disabled={loading}
              className="mt-2.5 flex cursor-pointer items-center gap-1.5 text-xs text-info hover:underline disabled:opacity-50"
            >
              {loading && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              {loading ? "Menyusun penjelasan..." : "Tanya lebih lanjut"}
            </button>
          )}
        </span>
      )}
    </span>
  );
}
