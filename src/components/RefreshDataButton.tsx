"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { RefreshCw, Loader2, Check, AlertTriangle, X, RotateCcw } from "lucide-react";

type Phase = "market" | "fundamentals" | "news" | "score" | "done";

interface State {
  status: "idle" | "running" | "done" | "error";
  phase: Phase;
  startedAt: string | null;
  finishedAt: string | null;
  progress: { done: number; total: number; label: string } | null;
  log: { phase: Phase; message: string }[];
  error: string | null;
  totals: { ok: number; failed: number };
}

const PHASE_LABEL: Record<Phase, string> = {
  market: "Harga & volume",
  fundamentals: "Fundamental saham AS",
  news: "Berita & sentimen",
  score: "Hitung ulang Investment Score",
  done: "Selesai",
};

const PHASE_ORDER: Phase[] = ["market", "fundamentals", "news", "score"];

/**
 * Menjalankan refresh dengan memanggil endpoint berulang kali.
 *
 * Tiap panggilan mengerjakan potongan pendek lalu berhenti, karena satu request
 * ke fungsi serverless tidak boleh berjalan lama. Loop-nya ada di sini, di
 * browser — itu sebabnya halaman perlu tetap terbuka selama proses berjalan,
 * dan itu dinyatakan langsung di UI.
 */
export function RefreshDataButton() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Loop dihentikan lewat ref supaya unmount benar-benar menghentikannya.
  const activeRef = useRef(false);

  const post = useCallback(async (action: "start" | "advance" | "reset") => {
    const res = await fetch("/api/jobs/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json()) as { state: State };
    return data.state;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/jobs/refresh");
        const data = (await res.json()) as { state: State };
        setState(data.state);
      } catch {
        // Status gagal dimuat bukan alasan menyembunyikan tombolnya.
      }
    })();

    return () => {
      activeRef.current = false;
    };
  }, []);

  const drive = useCallback(
    async (initial: State) => {
      let current = initial;
      activeRef.current = true;

      while (activeRef.current && current.status === "running") {
        try {
          current = await post("advance");
          setState(current);
        } catch {
          setError("Koneksi terputus di tengah proses. Klik Lanjutkan untuk meneruskan dari posisi terakhir.");
          break;
        }
      }

      activeRef.current = false;
      setBusy(false);
      // Muat ulang data halaman supaya angka yang baru langsung terlihat.
      startTransition(() => router.refresh());
    },
    [post, router],
  );

  async function start() {
    setBusy(true);
    setError(null);
    setOpen(true);
    try {
      const started = await post("start");
      setState(started);
      await drive(started);
    } catch {
      setError("Tidak bisa menghubungi server.");
      setBusy(false);
    }
  }

  async function resume() {
    if (!state) return;
    setBusy(true);
    setError(null);
    await drive(state);
  }

  async function cancel() {
    activeRef.current = false;
    setBusy(false);
    setState(await post("reset"));
  }

  const running = busy || state?.status === "running";
  const currentPhaseIndex = state ? PHASE_ORDER.indexOf(state.phase) : -1;

  return (
    <div className="w-full sm:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="flex h-10 cursor-pointer items-center gap-2 rounded bg-accent px-3.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {running ? (
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
          {running ? "Memperbarui..." : "Perbarui data"}
        </button>

        {running && (
          <button
            type="button"
            onClick={cancel}
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded border border-line px-3 text-xs text-fg-muted transition-colors hover:border-down hover:text-down"
          >
            <X size={13} aria-hidden="true" />
            Hentikan
          </button>
        )}

        {!running && state?.status === "running" && (
          <button
            type="button"
            onClick={resume}
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded border border-line px-3 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Lanjutkan
          </button>
        )}

        {state && state.log.length > 0 && !running && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="h-10 cursor-pointer rounded border border-line px-3 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            {open ? "Sembunyikan" : "Lihat hasil"}
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 flex max-w-xl gap-2 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn"
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {open && state && (state.log.length > 0 || state.status === "running") && (
        <div className="mt-2 w-full max-w-xl rounded border border-line bg-surface-2 p-3">
          <ul className="space-y-2">
            {PHASE_ORDER.map((phase, i) => {
              const logged = state.log.find((l) => l.phase === phase);
              const isCurrent = state.phase === phase && state.status === "running";
              const isPending = currentPhaseIndex >= 0 && i > currentPhaseIndex;

              return (
                <li key={phase} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0">
                    {logged ? (
                      <Check size={14} className="text-accent" aria-hidden="true" />
                    ) : isCurrent ? (
                      <Loader2 size={14} className="animate-spin text-info" aria-hidden="true" />
                    ) : (
                      <span
                        className={clsx(
                          "inline-block h-3.5 w-3.5 rounded-full border",
                          isPending ? "border-line-strong" : "border-line",
                        )}
                      />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{PHASE_LABEL[phase]}</span>

                    {isCurrent && state.progress && state.progress.total > 0 && (
                      <>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full bg-info transition-all"
                            style={{
                              width: `${Math.round((state.progress.done / state.progress.total) * 100)}%`,
                            }}
                          />
                        </span>
                        <span className="tnum mt-0.5 block text-[11px] text-fg-subtle">
                          {state.progress.done}/{state.progress.total} — {state.progress.label}
                        </span>
                      </>
                    )}

                    {logged && (
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
                        {logged.message}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {state.status === "error" && state.error && (
            <p className="mt-3 rounded border border-danger/40 bg-danger/10 px-2.5 py-2 text-[11px] text-down">
              {state.error}
            </p>
          )}

          <p className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-fg-subtle">
            {state.status === "done"
              ? "Selesai. Angka di halaman ini sudah diperbarui."
              : "Proses dipecah menjadi potongan pendek agar muat dalam batas waktu fungsi serverless, dan dilanjutkan dari browser. Biarkan halaman ini terbuka; kalau tertutup, tombol Lanjutkan akan meneruskan dari posisi terakhir."}
          </p>
        </div>
      )}
    </div>
  );
}
