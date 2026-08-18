import type { MetricFormat } from "./metrics";

const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const idrDecimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}%`;
}

export function formatPrice(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (currency === "IDR") return `Rp ${idr.format(value)}`;

  // Koin bernilai pecahan sangat kecil butuh presisi lebih. Membulatkan
  // ke 2 desimal akan menampilkan "$0" untuk harga $0,000042 — angka yang
  // bukan cuma tidak berguna, tapi salah.
  const abs = Math.abs(value);
  const digits = abs === 0 ? 2 : abs < 0.0001 ? 8 : abs < 0.01 ? 6 : abs < 1 ? 4 : 2;

  return `$${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(value)}`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatMetric(
  value: number | null | undefined,
  format: MetricFormat,
  currency = "USD",
): string {
  switch (format) {
    case "percent":
      return formatPercent(value, 1);
    case "ratio":
      return formatNumber(value, 2);
    case "currency":
      return formatPrice(value, currency);
    case "compact":
      return formatCompact(value);
    default:
      return formatNumber(value, 1);
  }
}

/** "3 jam lalu", "kemarin", "12 Agustus 2026" */
export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return "belum pernah";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";

  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;

  const days = Math.round(hours / 24);
  if (days === 1) return "kemarin";
  if (days < 30) return `${days} hari lalu`;

  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
