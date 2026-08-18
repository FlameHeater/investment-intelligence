"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

export function DeleteAlert({ id, ticker }: { id: string; ticker: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function remove() {
    // Konfirmasi sebelum aksi yang tidak bisa dibatalkan.
    if (!confirm(`Hapus alert untuk ${ticker}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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
      aria-label={`Hapus alert ${ticker}`}
      className="shrink-0 cursor-pointer rounded p-2 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-down disabled:opacity-50"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}
