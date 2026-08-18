"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";

export function RemoveFromWatchlist({ ticker }: { ticker: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/watchlist/items/${encodeURIComponent(ticker)}`, { method: "DELETE" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label={`Hapus ${ticker} dari watchlist`}
      className="shrink-0 cursor-pointer rounded p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-down disabled:opacity-50"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
    </button>
  );
}
