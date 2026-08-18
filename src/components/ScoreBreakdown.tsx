"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type { ScoreBreakdown as Breakdown } from "@/lib/types";
import { formatNumber } from "@/lib/format";

/**
 * PRD §14: "Tidak ada skor yang ditampilkan tanpa breakdown sub-skor yang bisa
 * diklik untuk lihat sumber datanya."
 *
 * Karena itu tiap dimensi bisa dibuka untuk melihat angka mentah yang dipakai
 * dan catatan keterbatasannya — termasuk saat dimensi itu tidak punya data.
 */

const DIMENSION_LABEL: Record<keyof Breakdown, string> = {
  fundamental: "Fundamental",
  technical: "Teknikal",
  valuation: "Valuasi",
  sentiment: "Sentimen",
  risk: "Risiko",
};

const DIMENSION_HINT: Record<keyof Breakdown, string> = {
  fundamental: "Kesehatan bisnis: profitabilitas, pertumbuhan, dan struktur utang.",
  technical: "Kondisi harga: tren, momentum, dan posisi terhadap rata-rata bergerak.",
  valuation: "Kewajaran harga terhadap laba dan nilai buku. Skor tinggi berarti relatif murah.",
  sentiment: "Nada berita 14 hari terakhir, dibobot menurut jenis sumbernya.",
  risk: "Volatilitas, drawdown, likuiditas, dan kesegaran data. Skor tinggi berarti risiko rendah.",
};

const INPUT_LABEL: Record<string, string> = {
  roe: "ROE (%)",
  net_margin: "Margin bersih (%)",
  gross_margin: "Margin kotor (%)",
  revenue_growth: "Pertumbuhan pendapatan (%)",
  eps_growth: "Pertumbuhan EPS (%)",
  debt_to_equity: "Debt to equity",
  current_ratio: "Current ratio",
  per: "PER",
  pbv: "PBV",
  dividend_yield: "Dividend yield (%)",
  trend: "Tren",
  rsi14: "RSI (14)",
  macd: "MACD",
  macd_histogram: "MACD histogram",
  sma20: "SMA 20",
  sma50: "SMA 50",
  sma200: "SMA 200",
  price_vs_sma50_pct: "Harga vs SMA 50 (%)",
  price_vs_sma200_pct: "Harga vs SMA 200 (%)",
  change30d: "Perubahan 30 hari (%)",
  change90d: "Perubahan 90 hari (%)",
  bar_count: "Jumlah bar historis",
  news_count_14d: "Berita 14 hari",
  positive: "Berita positif",
  neutral: "Berita netral",
  negative: "Berita negatif",
  annualized_volatility_pct: "Volatilitas tahunan (%)",
  max_drawdown_pct: "Max drawdown (%)",
  avg_turnover_30d: "Rata-rata nilai transaksi 30 hari",
  price_age_hours: "Umur data harga (jam)",
};

export function ScoreBreakdownPanel({
  breakdown,
  effectiveWeights,
  warnings,
}: {
  breakdown: Breakdown;
  effectiveWeights: Record<string, number>;
  warnings: string[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const keys = Object.keys(breakdown) as (keyof Breakdown)[];

  return (
    <div className="space-y-3">
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded border border-warn/40 bg-warn/10 p-3">
          {warnings.map((w, i) => (
            <li key={i} className="text-xs text-warn">
              {w}
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-1.5">
        {keys.map((key) => {
          const sub = breakdown[key];
          const weight = effectiveWeights[key] ?? 0;
          const open = expanded === key;
          const inputs = Object.entries(sub.inputs);

          return (
            <li key={key} className="rounded border border-line bg-surface-2">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : key)}
                aria-expanded={open}
                className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left"
              >
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={clsx("shrink-0 text-fg-subtle transition-transform", open && "rotate-180")}
                />

                <span className="min-w-24 text-sm font-medium">{DIMENSION_LABEL[key]}</span>

                {/* Bar skor — panjangnya membawa makna, angkanya tetap ditulis */}
                <span className="relative hidden h-1.5 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                  {sub.score !== null && (
                    <span
                      className={clsx(
                        "absolute inset-y-0 left-0 rounded-full",
                        sub.score >= 65 ? "bg-accent" : sub.score >= 45 ? "bg-info" : "bg-down",
                      )}
                      style={{ width: `${sub.score}%` }}
                    />
                  )}
                </span>

                <span className="ml-auto flex shrink-0 items-center gap-3">
                  <span className="text-xs text-fg-subtle">
                    bobot {(weight * 100).toFixed(0)}%
                  </span>
                  <span
                    className={clsx(
                      "tnum w-14 text-right text-sm font-semibold",
                      sub.score === null
                        ? "text-fg-subtle"
                        : sub.score >= 65
                          ? "text-accent"
                          : sub.score >= 45
                            ? "text-info"
                            : "text-down",
                    )}
                  >
                    {sub.score === null ? "n/a" : sub.score.toFixed(1)}
                  </span>
                </span>
              </button>

              {open && (
                <div className="space-y-3 border-t border-line px-3 py-3">
                  <p className="text-xs text-fg-muted">{DIMENSION_HINT[key]}</p>

                  {inputs.length > 0 ? (
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                      {inputs.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 border-b border-line/50 py-1">
                          <dt className="text-xs text-fg-muted">{INPUT_LABEL[k] ?? k}</dt>
                          <dd className="tnum text-xs">
                            {v === null || v === undefined ? (
                              <span className="text-fg-subtle">tidak tersedia</span>
                            ) : typeof v === "number" ? (
                              formatNumber(v, 2)
                            ) : (
                              String(v)
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-xs text-fg-subtle">
                      Tidak ada angka mentah untuk dimensi ini.
                    </p>
                  )}

                  <p className="text-xs text-fg-subtle">
                    Kelengkapan data dimensi ini: {(sub.dataCompleteness * 100).toFixed(0)}%
                  </p>

                  {sub.notes.length > 0 && (
                    <ul className="space-y-1 border-t border-line pt-2">
                      {sub.notes.map((note, i) => (
                        <li key={i} className="text-xs text-fg-muted">
                          {note}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
