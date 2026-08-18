"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, StarOff, RefreshCw, Loader2, BellPlus } from "lucide-react";
import clsx from "clsx";

export function AssetActions({
  ticker,
  inWatchlist,
  currency,
  lastPrice,
}: {
  ticker: string;
  inWatchlist: boolean;
  currency: string;
  lastPrice: number | null;
}) {
  const router = useRouter();
  const [watching, setWatching] = useState(inWatchlist);
  const [busy, setBusy] = useState<null | "watch" | "score" | "alert">(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [, startTransition] = useTransition();

  async function toggleWatch() {
    setBusy("watch");
    try {
      if (watching) {
        await fetch(`/api/watchlist/items/${encodeURIComponent(ticker)}`, { method: "DELETE" });
        setWatching(false);
        setMessage({ text: `${ticker} dihapus dari watchlist.`, tone: "ok" });
      } else {
        await fetch("/api/watchlist/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker }),
        });
        setWatching(true);
        setMessage({ text: `${ticker} ditambahkan ke watchlist.`, tone: "ok" });
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  async function refreshScore() {
    setBusy("score");
    setMessage(null);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(ticker)}/score/refresh`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        overall?: number;
        reasoningError?: string | null;
        error?: string;
      };

      if (!res.ok) {
        setMessage({ text: data.error ?? "Gagal menghitung ulang.", tone: "warn" });
      } else if (data.reasoningError) {
        // Skor berhasil, reasoning tidak — perbedaan ini harus jelas bagi pengguna.
        setMessage({
          text: `Skor diperbarui (${data.overall}). AI Reasoning tidak dibuat: ${data.reasoningError}`,
          tone: "warn",
        });
      } else {
        setMessage({ text: `Skor dan reasoning diperbarui (${data.overall}).`, tone: "ok" });
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  async function createAlert() {
    const input = prompt(
      `Buat alert harga untuk ${ticker}.\nContoh: "> 250" atau "< 180" (dalam ${currency}).`,
      lastPrice ? `> ${Math.round(lastPrice * 1.05)}` : "> ",
    );
    if (!input) return;

    const match = input.trim().match(/^([<>])\s*([\d.,]+)$/);
    if (!match) {
      setMessage({ text: 'Format tidak dikenali. Gunakan "> 250" atau "< 180".', tone: "warn" });
      return;
    }

    setBusy("alert");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          alertType: "price",
          condition: {
            operator: match[1] === ">" ? "gt" : "lt",
            value: Number(match[2].replace(/,/g, "")),
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      setMessage(
        res.ok
          ? { text: "Alert dibuat. Job watchlist akan memeriksanya.", tone: "ok" }
          : { text: data.error ?? "Gagal membuat alert.", tone: "warn" },
      );
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleWatch}
          disabled={busy !== null}
          aria-pressed={watching}
          className={clsx(
            "flex h-10 cursor-pointer items-center gap-2 rounded border px-3.5 text-sm font-medium transition-colors disabled:opacity-50",
            watching
              ? "border-accent bg-accent/10 text-accent"
              : "border-line text-fg hover:border-line-strong",
          )}
        >
          {busy === "watch" ? (
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          ) : watching ? (
            <Star size={15} aria-hidden="true" />
          ) : (
            <StarOff size={15} aria-hidden="true" />
          )}
          {watching ? "Dipantau" : "Pantau"}
        </button>

        <button
          type="button"
          onClick={refreshScore}
          disabled={busy !== null}
          className="flex h-10 cursor-pointer items-center gap-2 rounded border border-line px-3.5 text-sm transition-colors hover:border-line-strong disabled:opacity-50"
        >
          {busy === "score" ? (
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
          Hitung ulang + AI Reasoning
        </button>

        <button
          type="button"
          onClick={createAlert}
          disabled={busy !== null}
          className="flex h-10 cursor-pointer items-center gap-2 rounded border border-line px-3.5 text-sm transition-colors hover:border-line-strong disabled:opacity-50"
        >
          <BellPlus size={15} aria-hidden="true" />
          Alert harga
        </button>
      </div>

      {message && (
        <p
          role="status"
          aria-live="polite"
          className={clsx(
            "rounded border px-3 py-2 text-xs",
            message.tone === "ok"
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-warn/40 bg-warn/10 text-warn",
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
