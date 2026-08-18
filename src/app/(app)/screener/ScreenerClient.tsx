"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Loader2, Plus, Sparkles, Trash2, X, Save, AlertTriangle } from "lucide-react";
import type { AssetType, InvestmentMode } from "@/lib/types";
import { ASSET_TYPE_LABEL } from "@/lib/types";
import { formatMetric } from "@/lib/format";
import type { MetricFormat, MetricGroup } from "@/lib/metrics";
import { Card, Delta, ScorePill, TickerLink } from "@/components/ui";

interface MetricInfo {
  key: string;
  label: string;
  group: MetricGroup;
  format: MetricFormat;
  availableFor: AssetType[];
  description: string;
}

interface Filter {
  metric: string;
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "between";
  value: number;
  value2?: number;
}

interface Row {
  ticker: string;
  name: string;
  assetType: AssetType;
  sector: string | null;
  currency: string;
  values: Record<string, number | null>;
  overallScore: number | null;
  confidence: number | null;
  stale: boolean;
  missingMetrics: string[];
}

interface Result {
  rows: Row[];
  total: number;
  excludedForMissingData: number;
  notes: string[];
}

const OPERATOR_LABEL: Record<Filter["operator"], string> = {
  gt: "lebih dari",
  gte: "minimal",
  lt: "kurang dari",
  lte: "maksimal",
  eq: "sama dengan",
  between: "antara",
};

const ASSET_TYPES: AssetType[] = ["us_stock", "idx_stock", "crypto", "gold"];

const DISPLAY_COLUMNS = ["price", "change1d", "change30d", "rsi14", "roe", "per", "volatility"];

const EXAMPLE_QUERIES = [
  "saham AS dengan margin bersih di atas 20% dan utang rendah",
  "kripto yang turun lebih dari 20% dalam sebulan tapi volatilitasnya belum ekstrem",
  "saham AS ROE di atas 15% dan PER di bawah 20",
  "saham Indonesia yang naik paling banyak tiga bulan terakhir",
];

export function ScreenerClient({
  mode,
  modeLabel,
  metrics,
  aiAvailable,
}: {
  mode: InvestmentMode;
  modeLabel: string;
  metrics: MetricInfo[];
  aiAvailable: boolean;
}) {
  const [tab, setTab] = useState<"manual" | "ai">("manual");

  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sortBy, setSortBy] = useState("overall_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI screener
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<{
    interpretation: string;
    unsupported: string[];
    summary: string | null;
    summaryError: string | null;
    query: { filters: Filter[]; assetTypes: AssetType[] };
  } | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        filters: JSON.stringify(filters),
        sortBy,
        sortDir,
        limit: "100",
      });
      if (assetTypes.length) params.set("assetTypes", assetTypes.join(","));

      const res = await fetch(`/api/screener/run?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menjalankan screener.");
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [filters, assetTypes, sortBy, sortDir]);

  useEffect(() => {
    if (tab === "manual") void run();
  }, [tab, run]);

  async function runAi() {
    if (aiQuery.trim().length < 3) return;
    setAiLoading(true);
    setError(null);
    setAiResponse(null);

    try {
      const res = await fetch("/api/screener/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI Screener gagal.");

      setAiResponse({
        interpretation: data.interpretation,
        unsupported: data.unsupported ?? [],
        summary: data.summary,
        summaryError: data.summaryError,
        query: data.query,
      });
      setResult(data.result);
      // Filter hasil terjemahan disalin ke panel manual supaya bisa diperiksa
      // dan dikoreksi — AI tidak boleh jadi kotak hitam.
      setFilters(data.query.filters ?? []);
      setAssetTypes(data.query.assetTypes ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAiLoading(false);
    }
  }

  async function saveScreener() {
    const name = prompt("Nama untuk screener ini:");
    if (!name) return;
    await fetch("/api/screener/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        query: { assetTypes, filters, sortBy, sortDir, limit: 100 },
      }),
    });
  }

  const groups: MetricGroup[] = ["fundamental", "valuation", "technical", "market"];
  const groupLabel: Record<MetricGroup, string> = {
    fundamental: "Fundamental",
    valuation: "Valuasi",
    technical: "Teknikal",
    market: "Market Intelligence",
  };

  return (
    <div className="space-y-4">
      {/* Tab */}
      <div role="tablist" className="flex gap-1 border-b border-line">
        {(["manual", "ai"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              "cursor-pointer border-b-2 px-4 py-2 text-sm transition-colors",
              tab === t
                ? "border-accent font-medium text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t === "manual" ? "Advanced Screener" : "AI Screener"}
          </button>
        ))}
      </div>

      {tab === "ai" && (
        <Card>
          {!aiAvailable ? (
            <div className="flex gap-2 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
              <p className="text-fg-muted">
                AI Screener butuh <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> di
                berkas <code className="font-mono text-xs">.env</code>. Advanced Screener manual
                tetap berfungsi penuh tanpa itu — ia memakai mesin filter yang sama.
              </p>
            </div>
          ) : (
            <>
              <label htmlFor="ai-query" className="mb-1.5 block text-sm font-medium">
                Jelaskan apa yang Anda cari
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="ai-query"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !aiLoading && runAi()}
                  maxLength={500}
                  placeholder="mis. saham AS margin tinggi dan utang rendah"
                  className="h-11 flex-1 rounded border border-line bg-bg px-3 text-base outline-none transition-colors focus:border-info"
                />
                <button
                  type="button"
                  onClick={runAi}
                  disabled={aiLoading || aiQuery.trim().length < 3}
                  className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded bg-accent px-5 font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {aiLoading ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles size={16} aria-hidden="true" />
                  )}
                  {aiLoading ? "Memproses..." : "Cari"}
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {EXAMPLE_QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAiQuery(q)}
                    className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <p className="mt-3 text-xs text-fg-subtle">
                Claude hanya menerjemahkan kalimat Anda menjadi filter. Filter itu lalu dijalankan
                oleh mesin yang sama dengan Advanced Screener, dan hasil terjemahannya disalin ke
                tab manual supaya bisa Anda periksa.
              </p>

              {aiResponse && (
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                      Interpretasi
                    </p>
                    <p className="mt-1 text-sm">{aiResponse.interpretation}</p>
                  </div>

                  {aiResponse.unsupported.length > 0 && (
                    <div className="rounded border border-warn/40 bg-warn/10 p-3">
                      <p className="text-xs font-medium text-warn">
                        Tidak bisa diterjemahkan sepenuhnya
                      </p>
                      <ul className="mt-1 list-inside list-disc text-xs text-fg-muted">
                        {aiResponse.unsupported.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiResponse.summary && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                        Ringkasan hasil
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">
                        {aiResponse.summary}
                      </p>
                    </div>
                  )}
                  {aiResponse.summaryError && (
                    <p className="text-xs text-warn">
                      Ringkasan AI gagal dibuat ({aiResponse.summaryError}), tapi hasil filternya di
                      bawah tetap valid.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Panel filter — selalu terlihat, termasuk saat memakai AI */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Filter aktif</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveScreener}
              disabled={filters.length === 0}
              className="flex cursor-pointer items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              <Save size={13} aria-hidden="true" />
              Simpan
            </button>
            {filters.length > 0 && (
              <button
                type="button"
                onClick={() => setFilters([])}
                className="flex cursor-pointer items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
              >
                <Trash2 size={13} aria-hidden="true" />
                Hapus semua
              </button>
            )}
          </div>
        </div>

        {/* Kelas aset */}
        <fieldset className="mb-3">
          <legend className="mb-1.5 text-xs text-fg-muted">Kelas aset</legend>
          <div className="flex flex-wrap gap-1.5">
            {ASSET_TYPES.map((t) => {
              const active = assetTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setAssetTypes((prev) =>
                      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                    )
                  }
                  className={clsx(
                    "min-h-9 cursor-pointer rounded border px-3 text-xs transition-colors",
                    active
                      ? "border-accent bg-accent/10 font-medium text-accent"
                      : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  {ASSET_TYPE_LABEL[t]}
                </button>
              );
            })}
            {assetTypes.length === 0 && (
              <span className="self-center text-xs text-fg-subtle">semua kelas aset</span>
            )}
          </div>
        </fieldset>

        {filters.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {filters.map((f, i) => {
              const metric = metrics.find((m) => m.key === f.metric);
              return (
                <li
                  key={`${f.metric}-${i}`}
                  className="flex items-center gap-2 rounded border border-line bg-surface-2 px-3 py-2 text-sm"
                >
                  <span className="flex-1">
                    <span className="font-medium">{metric?.label ?? f.metric}</span>{" "}
                    <span className="text-fg-muted">{OPERATOR_LABEL[f.operator]}</span>{" "}
                    <span className="tnum">{f.value}</span>
                    {f.operator === "between" && f.value2 !== undefined && (
                      <>
                        {" "}
                        <span className="text-fg-muted">dan</span>{" "}
                        <span className="tnum">{f.value2}</span>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Hapus filter ${metric?.label ?? f.metric}`}
                    className="cursor-pointer rounded p-1 text-fg-subtle transition-colors hover:text-down"
                  >
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <FilterBuilder
          metrics={metrics}
          groups={groups}
          groupLabel={groupLabel}
          onAdd={(f) => setFilters((prev) => [...prev, f])}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <label htmlFor="sort-by" className="text-xs text-fg-muted">
            Urutkan
          </label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-9 cursor-pointer rounded border border-line bg-bg px-2 text-sm"
          >
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Arah urutan"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
            className="h-9 cursor-pointer rounded border border-line bg-bg px-2 text-sm"
          >
            <option value="desc">Terbesar dulu</option>
            <option value="asc">Terkecil dulu</option>
          </select>

          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="ml-auto flex h-9 cursor-pointer items-center gap-2 rounded bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Jalankan
          </button>
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/10 p-3 text-sm text-down">
          {error}
        </p>
      )}

      {/* Hasil */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
          <p className="text-sm">
            {loading ? (
              <span className="text-fg-muted">Menghitung...</span>
            ) : result ? (
              <>
                <span className="font-medium">{result.total}</span>{" "}
                <span className="text-fg-muted">
                  aset lolos filter · skor memakai mode {modeLabel}
                </span>
              </>
            ) : (
              <span className="text-fg-muted">Belum dijalankan</span>
            )}
          </p>
        </div>

        {result?.notes && result.notes.length > 0 && (
          <div className="border-b border-line bg-surface-2 px-4 py-2.5">
            {result.notes.map((note, i) => (
              <p key={i} className="text-xs text-fg-muted">
                {note}
              </p>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        ) : !result || result.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-fg-muted">
            {result
              ? "Tidak ada aset yang lolos. Coba longgarkan filter, atau periksa apakah metrik yang Anda pakai memang tersedia untuk kelas aset yang dipilih."
              : "Atur filter lalu klik Jalankan."}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Aset
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Skor
                  </th>
                  {DISPLAY_COLUMNS.map((key) => (
                    <th
                      key={key}
                      scope="col"
                      className="px-3 py-2.5 text-right font-medium"
                      title={metrics.find((m) => m.key === key)?.description}
                    >
                      {metrics.find((m) => m.key === key)?.label ?? key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr
                    key={row.ticker}
                    className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <TickerLink ticker={row.ticker} name={row.name} />
                        {row.stale && (
                          <span
                            className="rounded border border-warn/40 px-1 text-[10px] text-warn"
                            title="Data harga lebih tua dari 48 jam"
                          >
                            basi
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <ScorePill score={row.overallScore} confidence={row.confidence} size="sm" />
                    </td>
                    {DISPLAY_COLUMNS.map((key) => {
                      const metric = metrics.find((m) => m.key === key);
                      const value = row.values[key] ?? null;
                      const isDelta = key.startsWith("change");

                      return (
                        <td key={key} className="px-3 py-2 text-right">
                          {isDelta ? (
                            <Delta value={value} />
                          ) : value === null ? (
                            <span
                              className="text-fg-subtle"
                              title={
                                metric && !metric.availableFor.includes(row.assetType)
                                  ? `${metric.label} tidak tersedia untuk ${ASSET_TYPE_LABEL[row.assetType]}`
                                  : "Data belum ada"
                              }
                            >
                              n/a
                            </span>
                          ) : (
                            <span className="tnum">
                              {formatMetric(value, metric?.format ?? "number", row.currency)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function FilterBuilder({
  metrics,
  groups,
  groupLabel,
  onAdd,
}: {
  metrics: MetricInfo[];
  groups: MetricGroup[];
  groupLabel: Record<MetricGroup, string>;
  onAdd: (f: Filter) => void;
}) {
  const [metric, setMetric] = useState(metrics[0]?.key ?? "");
  const [operator, setOperator] = useState<Filter["operator"]>("gt");
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");

  const selected = metrics.find((m) => m.key === metric);

  function add() {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    onAdd({
      metric,
      operator,
      value: v,
      ...(operator === "between" && Number.isFinite(Number(value2))
        ? { value2: Number(value2) }
        : {}),
    });
    setValue("");
    setValue2("");
  }

  return (
    <div className="rounded border border-dashed border-line-strong p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-45 flex-1">
          <label htmlFor="fb-metric" className="mb-1 block text-xs text-fg-muted">
            Metrik
          </label>
          <select
            id="fb-metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="h-10 w-full cursor-pointer rounded border border-line bg-bg px-2 text-sm"
          >
            {groups.map((g) => (
              <optgroup key={g} label={groupLabel[g]}>
                {metrics
                  .filter((m) => m.group === g)
                  .map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fb-op" className="mb-1 block text-xs text-fg-muted">
            Kondisi
          </label>
          <select
            id="fb-op"
            value={operator}
            onChange={(e) => setOperator(e.target.value as Filter["operator"])}
            className="h-10 cursor-pointer rounded border border-line bg-bg px-2 text-sm"
          >
            {Object.entries(OPERATOR_LABEL).map(([op, label]) => (
              <option key={op} value={op}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-24">
          <label htmlFor="fb-value" className="mb-1 block text-xs text-fg-muted">
            Nilai
          </label>
          <input
            id="fb-value"
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="tnum h-10 w-full rounded border border-line bg-bg px-2 text-sm"
          />
        </div>

        {operator === "between" && (
          <div className="w-24">
            <label htmlFor="fb-value2" className="mb-1 block text-xs text-fg-muted">
              Sampai
            </label>
            <input
              id="fb-value2"
              type="number"
              inputMode="decimal"
              value={value2}
              onChange={(e) => setValue2(e.target.value)}
              className="tnum h-10 w-full rounded border border-line bg-bg px-2 text-sm"
            />
          </div>
        )}

        <button
          type="button"
          onClick={add}
          disabled={value === ""}
          className="flex h-10 cursor-pointer items-center gap-1.5 rounded border border-line px-3 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          <Plus size={14} aria-hidden="true" />
          Tambah
        </button>
      </div>

      {selected && (
        <p className="mt-2 text-xs text-fg-subtle">
          {selected.description}{" "}
          <span className="text-fg-muted">
            Tersedia untuk: {selected.availableFor.map((t) => ASSET_TYPE_LABEL[t]).join(", ")}.
          </span>
        </p>
      )}
    </div>
  );
}
