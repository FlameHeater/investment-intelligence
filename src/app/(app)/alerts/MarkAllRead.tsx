"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

export function MarkAllRead({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function mark() {
    setBusy(true);
    try {
      await fetch("/api/alerts/feed", { method: "POST" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={mark}
      disabled={busy}
      className="flex h-10 cursor-pointer items-center gap-2 rounded border border-line px-3.5 text-sm transition-colors hover:border-line-strong disabled:opacity-50"
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
      ) : (
        <Check size={15} aria-hidden="true" />
      )}
      Tandai {count} sudah dibaca
    </button>
  );
}
