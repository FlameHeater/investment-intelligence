"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

/**
 * Chart harga dengan lightweight-charts.
 *
 * Aset yang datanya hanya punya close (kripto dari CoinGecko) digambar sebagai
 * garis, bukan candle palsu yang open/high/low-nya disamakan dengan close.
 * Menggambar candle dari data yang tidak punya OHLC akan menampilkan pola yang
 * sebenarnya tidak ada di pasar.
 */

const RANGES = [
  { key: "1m", label: "1B" },
  { key: "3m", label: "3B" },
  { key: "6m", label: "6B" },
  { key: "1y", label: "1T" },
  { key: "2y", label: "2T" },
  { key: "max", label: "Maks" },
] as const;

interface Bar {
  time: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export function PriceChart({ ticker, currency }: { ticker: string; currency: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<string>("1y");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [barCount, setBarCount] = useState(0);
  const [isLine, setIsLine] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    async function draw() {
      setLoading(true);
      setError(null);

      try {
        const [{ createChart, ColorType, CandlestickSeries, LineSeries }, res] = await Promise.all([
          import("lightweight-charts"),
          fetch(`/api/assets/${encodeURIComponent(ticker)}/price?range=${range}`),
        ]);

        const data = (await res.json()) as { bars: Bar[]; hasOhlc: boolean; error?: string };
        if (disposed) return;
        if (!res.ok) throw new Error(data.error ?? "Gagal memuat data harga.");

        const bars = (data.bars ?? []).filter((b) => b.close !== null);
        setBarCount(bars.length);
        setIsLine(!data.hasOhlc);

        if (bars.length === 0 || !containerRef.current) {
          setLoading(false);
          return;
        }

        containerRef.current.innerHTML = "";
        const chart = createChart(containerRef.current, {
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "#94a3b8",
            fontFamily: "var(--font-fira-code), monospace",
            attributionLogo: false,
          },
          grid: {
            vertLines: { color: "rgba(38, 48, 74, 0.5)" },
            horzLines: { color: "rgba(38, 48, 74, 0.5)" },
          },
          rightPriceScale: { borderColor: "#26304a" },
          timeScale: { borderColor: "#26304a", timeVisible: false },
          crosshair: { mode: 1 },
          height: 320,
          autoSize: true,
        });

        if (data.hasOhlc) {
          const series = chart.addSeries(CandlestickSeries, {
            upColor: "#22c55e",
            downColor: "#f87171",
            borderUpColor: "#22c55e",
            borderDownColor: "#f87171",
            wickUpColor: "#22c55e",
            wickDownColor: "#f87171",
          });
          series.setData(
            bars
              .filter((b) => b.open !== null && b.high !== null && b.low !== null)
              .map((b) => ({
                time: b.time as never,
                open: b.open!,
                high: b.high!,
                low: b.low!,
                close: b.close!,
              })),
          );
        } else {
          const series = chart.addSeries(LineSeries, {
            color: "#22c55e",
            lineWidth: 2,
          });
          series.setData(bars.map((b) => ({ time: b.time as never, value: b.close! })));
        }

        chart.timeScale().fitContent();
        cleanup = () => chart.remove();
      } catch (err) {
        if (!disposed) setError((err as Error).message);
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void draw();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [ticker, range]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Rentang waktu chart"
          className="flex gap-1 rounded border border-line p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              className={clsx(
                "min-h-8 cursor-pointer rounded px-2.5 text-xs transition-colors",
                range === r.key
                  ? "bg-surface-2 font-medium text-fg"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-subtle">
          {barCount} bar · {currency}
          {isLine && barCount > 0 && " · digambar sebagai garis (sumber hanya menyediakan harga penutupan)"}
        </p>
      </div>

      {/* Tinggi dipesan lebih dulu supaya tidak ada layout shift saat chart dimuat. */}
      <div className="relative h-80 w-full">
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-surface/60">
            <Loader2 size={20} className="animate-spin text-fg-subtle" aria-hidden="true" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="text-sm text-down">{error}</p>
          </div>
        )}
        {!loading && !error && barCount === 0 && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="max-w-xs text-center text-sm text-fg-muted">
              Belum ada data harga tersimpan untuk rentang ini. Jalankan{" "}
              <code className="font-mono text-xs">npm run job:market</code> untuk mengisinya.
            </p>
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
