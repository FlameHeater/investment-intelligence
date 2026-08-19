"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  RefreshCw,
  Loader2,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  SkipForward,
} from "lucide-react";

interface Step {
  key: string;
  label: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  detail?: string;
  progress?: { done: number; total: number; label: string };
}

interface State {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  steps: Step[];
  error: string | null;
}

interface Payload {
  mode: "in_process" | "github_actions" | "unavailable";
  explanation: string;
  state: State;
  message?: string;
  started?: boolean;
  externalUrl?: string;
}

const STATUS_ICON = {
  pending: <span className="inline-block h-3.5 w-3.5 rounded-full border border-line-strong" />,
  running: <Loader2 size={14} className="animate-spin text-info" aria-hidden="true" />,
  success: <Check size={14} className="text-accent" aria-hidden="true" />,
  error: <X size={14} className="text-down" aria-hidden="true" />,
  skipped: <SkipForward size={14} className="text-fg-subtle" aria-hidden="true" />,
};

const STATUS_TEXT = {
  pending: "menunggu",
  running: "berjalan",
  success: "selesai",
  error: "gagal",
  skipped: "dilewati",
};

export function RefreshDataButton() {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/refresh");
      setPayload((await res.json()) as Payload);
    } catch {
      // Gagal memuat status bukan alasan menampilkan error mencolok — tombolnya
      // tetap bisa dipakai, dan status akan terisi pada polling berikutnya.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Polling hanya saat ada job berjalan; saat menganggur, tidak ada permintaan
  // berkala sama sekali.
  useEffect(() => {
    if (!payload?.state.running) {
      // Job baru saja selesai → muat ulang data halaman sekali.
      if (wasRunning.current) {
        wasRunning.current = false;
        startTransition(() => router.refresh());
      }
      return;
    }
    wasRunning.current = true;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [payload?.state.running, load, router]);

  async function start() {
    setStarting(true);
    setNotice(null);
    setExternalUrl(null);
    try {
      const res = await fetch("/api/jobs/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as Payload;
      setPayload(data);
      setNotice(data.message ?? null);
      setExternalUrl(data.externalUrl ?? null);
      if (data.started) setOpen(true);
    } catch {
      setNotice("Tidak bisa menghubungi server.");
    } finally {
      setStarting(false);
    }
  }

  const running = payload?.state.running ?? false;
  const unavailable = payload?.mode === "unavailable";
  const steps = payload?.state.steps ?? [];

  return (
    <div className="w-full sm:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={starting || running || unavailable}
          title={unavailable ? payload?.explanation : undefined}
          className={clsx(
            "flex h-10 cursor-pointer items-center gap-2 rounded px-3.5 text-sm font-medium transition-opacity",
            unavailable
              ? "cursor-not-allowed border border-line text-fg-subtle"
              : "bg-accent text-accent-fg hover:opacity-90",
            (starting || running) && "opacity-60",
          )}
        >
          {starting || running ? (
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
          {running ? "Memperbarui..." : "Perbarui data"}
        </button>

        {steps.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="h-10 cursor-pointer rounded border border-line px-3 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            {open ? "Sembunyikan progres" : "Lihat progres"}
          </button>
        )}
      </div>

      {(notice || unavailable) && (
        <p
          role="status"
          aria-live="polite"
          className={clsx(
            "mt-2 flex max-w-xl gap-2 rounded border px-3 py-2 text-xs",
            unavailable || payload?.started === false
              ? "border-warn/40 bg-warn/10 text-warn"
              : "border-accent/40 bg-accent/10 text-accent",
          )}
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {notice ?? payload?.explanation}
            {externalUrl && (
              <>
                {" "}
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  Lihat progresnya di GitHub
                  <ExternalLink size={10} aria-hidden="true" />
                </a>
              </>
            )}
          </span>
        </p>
      )}

      {open && steps.length > 0 && (
        <div className="mt-2 w-full max-w-xl rounded border border-line bg-surface-2 p-3">
          <ul className="space-y-2">
            {steps.map((step) => (
              <li key={step.key} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">{STATUS_ICON[step.status]}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-medium">{step.label}</span>
                    <span className="text-[11px] text-fg-subtle">{STATUS_TEXT[step.status]}</span>
                  </span>

                  {step.progress && (
                    <span className="mt-1 block">
                      <span className="block h-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full bg-info transition-all"
                          style={{
                            width: `${Math.round((step.progress.done / Math.max(step.progress.total, 1)) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="tnum mt-0.5 block text-[11px] text-fg-subtle">
                        {step.progress.done}/{step.progress.total} — {step.progress.label}
                      </span>
                    </span>
                  )}

                  {step.detail && (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
                      {step.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {payload?.explanation && (
            <p className="mt-3 border-t border-line pt-2 text-[11px] text-fg-subtle">
              {payload.explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
