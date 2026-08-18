import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Info, ShieldCheck, Newspaper, MessageCircleWarning } from "lucide-react";
import type { Freshness, SourceType } from "@/lib/types";
import { FRESHNESS_LABEL } from "@/lib/types";
import { formatRelative } from "@/lib/format";

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={clsx("card p-4 sm:p-5", className)}>{children}</Tag>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Badge kesegaran data — WAJIB tampil di mana pun angka harga ditampilkan.
 * PRD §4: dilarang mengklaim real-time kalau sumbernya delayed.
 */
export function FreshnessBadge({
  freshness,
  lastUpdated,
  source,
  stale,
}: {
  freshness: Freshness | null;
  lastUpdated: Date | string | null;
  source?: string | null;
  stale?: boolean;
}) {
  const label = freshness ? FRESHNESS_LABEL[freshness] : "Sumber tidak diketahui";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs",
        stale
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-line bg-muted text-fg-muted",
      )}
      title={source ? `Sumber: ${source}` : undefined}
    >
      {stale ? <AlertTriangle size={12} aria-hidden="true" /> : <Info size={12} aria-hidden="true" />}
      <span>{label}</span>
      <span aria-hidden="true">·</span>
      <span>{formatRelative(lastUpdated)}</span>
    </span>
  );
}

/** PRD §5 poin 7: Source Verification badge, aturan statis. */
export function SourceBadge({ sourceType }: { sourceType: SourceType | string }) {
  const map: Record<string, { label: string; className: string; icon: ReactNode }> = {
    official: {
      label: "Resmi",
      className: "border-accent/40 bg-accent/10 text-accent",
      icon: <ShieldCheck size={12} aria-hidden="true" />,
    },
    media: {
      label: "Media",
      className: "border-info/40 bg-info/10 text-info",
      icon: <Newspaper size={12} aria-hidden="true" />,
    },
    social_unverified: {
      label: "Belum terverifikasi",
      className: "border-warn/40 bg-warn/10 text-warn",
      icon: <MessageCircleWarning size={12} aria-hidden="true" />,
    },
  };
  const item = map[sourceType] ?? map.media;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium",
        item.className,
      )}
    >
      {item.icon}
      {item.label}
    </span>
  );
}

export function Delta({ value, digits = 2 }: { value: number | null; digits?: number }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="tnum text-fg-subtle">—</span>;
  }
  const up = value > 0;
  const flat = Math.abs(value) < 0.005;

  return (
    <span
      className={clsx(
        "tnum",
        flat ? "text-fg-muted" : up ? "text-up" : "text-down",
      )}
    >
      {/* tanda +/- membawa makna tanpa bergantung pada warna */}
      {flat ? "" : up ? "+" : ""}
      {value.toFixed(digits)}%
    </span>
  );
}

export function ScorePill({
  score,
  confidence,
  size = "md",
}: {
  score: number | null;
  confidence?: number | null;
  size?: "sm" | "md" | "lg";
}) {
  if (score === null) {
    return (
      <span className="rounded border border-line bg-muted px-2 py-0.5 text-xs text-fg-subtle">
        belum dinilai
      </span>
    );
  }

  const tone =
    score >= 65 ? "text-accent border-accent/40 bg-accent/10"
    : score >= 45 ? "text-info border-info/40 bg-info/10"
    : "text-down border-down/40 bg-down/10";

  const sizing =
    size === "lg" ? "text-2xl px-3 py-1.5"
    : size === "sm" ? "text-xs px-1.5 py-0.5"
    : "text-sm px-2 py-1";

  return (
    <span className="inline-flex items-center gap-2">
      <span className={clsx("tnum rounded border font-semibold", tone, sizing)}>
        {score.toFixed(1)}
      </span>
      {confidence !== undefined && confidence !== null && (
        <span
          className={clsx(
            "text-xs",
            confidence < 0.5 ? "text-warn" : "text-fg-subtle",
          )}
          title="Confidence: seberapa lengkap data yang mendasari skor ini"
        >
          conf {(confidence * 100).toFixed(0)}%
        </span>
      )}
    </span>
  );
}

/** PRD §12 — teks statis, tidak di-generate AI. Wajib di setiap halaman skor/signal. */
export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      className={clsx(
        "rounded border border-line-strong bg-surface-2 text-fg-muted",
        compact ? "px-3 py-2 text-xs" : "p-4 text-sm",
      )}
      aria-label="Disclaimer"
    >
      <p className="flex gap-2">
        <AlertTriangle
          size={compact ? 14 : 16}
          className="mt-0.5 shrink-0 text-warn"
          aria-hidden="true"
        />
        <span>
          Informasi di platform ini bersifat analitis dan edukatif, bukan rekomendasi atau jaminan
          keuntungan. Data dapat mengalami keterlambatan (delayed) sesuai sumbernya dan ditampilkan
          dengan timestamp. Keputusan investasi sepenuhnya menjadi tanggung jawab pengguna. Untuk
          keputusan material, verifikasi data pada sumber resmi (IDX, SEC, laporan perusahaan).
        </span>
      </p>
    </aside>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center">
      <p className="font-medium text-fg">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function TickerLink({
  ticker,
  name,
  className,
}: {
  ticker: string;
  name?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/asset/${encodeURIComponent(ticker)}`}
      className={clsx(
        "group inline-flex flex-col gap-0.5 rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-surface-2",
        className,
      )}
    >
      <span className="font-mono text-sm font-semibold text-fg group-hover:text-accent">
        {ticker}
      </span>
      {name && <span className="line-clamp-1 text-xs text-fg-subtle">{name}</span>}
    </Link>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "up" | "down" | "warn" | "neutral";
}) {
  return (
    <div className="rounded border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={clsx(
          "tnum mt-1 text-lg font-semibold",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "warn" && "text-warn",
          (!tone || tone === "neutral") && "text-fg",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
