import type { AssetType } from "./types";

/**
 * Katalog field yang BENAR-BENAR bisa diisi dari provider di PRD §4.
 * PRD §8 sengaja memangkas daftar panjang dari PRD v1 — field yang tidak ada
 * sumbernya tidak didaftarkan di sini, supaya screener tidak pernah menjanjikan
 * filter yang hasilnya selalu kosong.
 */

export type MetricGroup = "fundamental" | "valuation" | "technical" | "market";
export type MetricFormat = "percent" | "ratio" | "currency" | "number" | "compact";

export interface MetricDef {
  key: string;
  label: string;
  group: MetricGroup;
  format: MetricFormat;
  /** true = nilai lebih besar umumnya lebih baik (untuk pewarnaan UI) */
  higherIsBetter: boolean | null;
  /** kelas aset yang punya data untuk metrik ini */
  availableFor: AssetType[];
  description: string;
}

const STOCKS: AssetType[] = ["us_stock"];
const ALL: AssetType[] = ["us_stock", "idx_stock", "crypto", "gold"];

export const METRICS: MetricDef[] = [
  // ── Fundamental (PRD §8) — hanya saham AS, karena IDX tidak punya sumber gratis
  {
    key: "revenue_growth",
    label: "Pertumbuhan Pendapatan (YoY)",
    group: "fundamental",
    format: "percent",
    higherIsBetter: true,
    availableFor: STOCKS,
    description:
      "Kenaikan pendapatan dibanding periode yang sama tahun lalu. Menunjukkan apakah bisnisnya masih tumbuh.",
  },
  {
    key: "eps",
    label: "EPS (TTM)",
    group: "fundamental",
    format: "number",
    higherIsBetter: true,
    availableFor: STOCKS,
    description: "Laba bersih per lembar saham selama 12 bulan terakhir.",
  },
  {
    key: "eps_growth",
    label: "Pertumbuhan EPS (YoY)",
    group: "fundamental",
    format: "percent",
    higherIsBetter: true,
    availableFor: STOCKS,
    description: "Kenaikan laba per saham dibanding tahun lalu.",
  },
  {
    key: "gross_margin",
    label: "Margin Kotor",
    group: "fundamental",
    format: "percent",
    higherIsBetter: true,
    availableFor: STOCKS,
    description:
      "Persentase pendapatan yang tersisa setelah biaya produksi. Margin tinggi biasanya berarti produk punya daya tawar harga.",
  },
  {
    key: "net_margin",
    label: "Margin Bersih",
    group: "fundamental",
    format: "percent",
    higherIsBetter: true,
    availableFor: STOCKS,
    description: "Persentase pendapatan yang benar-benar menjadi laba bersih.",
  },
  {
    key: "roe",
    label: "ROE",
    group: "fundamental",
    format: "percent",
    higherIsBetter: true,
    availableFor: STOCKS,
    description:
      "Return on Equity — seberapa efisien perusahaan mengubah modal pemegang saham menjadi laba.",
  },
  {
    key: "debt_to_equity",
    label: "Debt to Equity",
    group: "fundamental",
    format: "ratio",
    higherIsBetter: false,
    availableFor: STOCKS,
    description:
      "Perbandingan utang terhadap modal. Semakin tinggi, semakin besar ketergantungan pada pinjaman.",
  },
  {
    key: "current_ratio",
    label: "Current Ratio",
    group: "fundamental",
    format: "ratio",
    higherIsBetter: true,
    availableFor: STOCKS,
    description:
      "Kemampuan membayar kewajiban jangka pendek dengan aset lancar. Di bawah 1 berarti aset lancar tidak menutup utang jangka pendek.",
  },

  // ── Valuasi
  {
    key: "per",
    label: "PER",
    group: "valuation",
    format: "ratio",
    higherIsBetter: false,
    availableFor: STOCKS,
    description:
      "Price to Earnings Ratio — harga saham dibagi laba per saham. Kasarnya: berapa tahun laba untuk balik modal.",
  },
  {
    key: "pbv",
    label: "PBV",
    group: "valuation",
    format: "ratio",
    higherIsBetter: false,
    availableFor: STOCKS,
    description: "Price to Book Value — harga saham dibanding nilai buku ekuitas per saham.",
  },
  {
    key: "dividend_yield",
    label: "Dividend Yield",
    group: "valuation",
    format: "percent",
    higherIsBetter: true,
    availableFor: STOCKS,
    description: "Dividen setahun dibagi harga saham saat ini.",
  },

  // ── Teknikal — tersedia untuk semua aset yang punya data harga
  {
    key: "price",
    label: "Harga",
    group: "technical",
    format: "currency",
    higherIsBetter: null,
    availableFor: ALL,
    description: "Harga penutupan terakhir yang tersimpan di cache.",
  },
  {
    key: "change1d",
    label: "Perubahan 1 Hari",
    group: "technical",
    format: "percent",
    higherIsBetter: null,
    availableFor: ALL,
    description: "Perubahan harga dibanding bar sebelumnya.",
  },
  {
    key: "change7d",
    label: "Perubahan 1 Minggu",
    group: "technical",
    format: "percent",
    higherIsBetter: null,
    availableFor: ALL,
    description: "Perubahan harga selama sekitar 5 hari bursa.",
  },
  {
    key: "change30d",
    label: "Perubahan 1 Bulan",
    group: "technical",
    format: "percent",
    higherIsBetter: null,
    availableFor: ALL,
    description: "Perubahan harga selama sekitar 21 hari bursa.",
  },
  {
    key: "change90d",
    label: "Perubahan 3 Bulan",
    group: "technical",
    format: "percent",
    higherIsBetter: null,
    availableFor: ALL,
    description: "Perubahan harga selama sekitar 63 hari bursa.",
  },
  {
    key: "rsi14",
    label: "RSI (14)",
    group: "technical",
    format: "number",
    higherIsBetter: null,
    availableFor: ALL,
    description:
      "Relative Strength Index. Di atas 70 sering disebut jenuh beli, di bawah 30 jenuh jual. Bukan sinyal beli/jual otomatis.",
  },
  {
    key: "volatility",
    label: "Volatilitas Tahunan",
    group: "technical",
    format: "percent",
    higherIsBetter: false,
    availableFor: ALL,
    description:
      "Seberapa liar harga bergerak, disetahunkan dari return harian 90 hari terakhir.",
  },
  {
    key: "distanceFromHigh52w",
    label: "Jarak dari Puncak 52 Minggu",
    group: "technical",
    format: "percent",
    higherIsBetter: null,
    availableFor: ALL,
    description: "Seberapa jauh harga sekarang di bawah harga tertinggi setahun terakhir.",
  },
  {
    key: "maxDrawdown",
    label: "Max Drawdown",
    group: "technical",
    format: "percent",
    higherIsBetter: false,
    availableFor: ALL,
    description: "Penurunan terdalam dari puncak ke lembah dalam rentang data yang tersedia.",
  },

  // ── Market intelligence
  {
    key: "newsCount7d",
    label: "Jumlah Berita (7 hari)",
    group: "market",
    format: "number",
    higherIsBetter: null,
    availableFor: ALL,
    description: "Berapa artikel berita tersimpan untuk aset ini dalam 7 hari terakhir.",
  },
  {
    key: "overall_score",
    label: "Investment Score",
    group: "market",
    format: "number",
    higherIsBetter: true,
    availableFor: ALL,
    description:
      "Skor gabungan 0-100 dari lima sub-skor, dibobot sesuai Investment Mode aktif.",
  },
  {
    key: "confidence",
    label: "Confidence",
    group: "market",
    format: "percent",
    higherIsBetter: true,
    availableFor: ALL,
    description:
      "Seberapa lengkap data yang mendasari skor. Rendah berarti skor dihitung dari data yang bolong.",
  },
];

export const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

export function metricsFor(assetType: AssetType): MetricDef[] {
  return METRICS.filter((m) => m.availableFor.includes(assetType));
}

/** Glosarium untuk Contextual Education (PRD §5 poin 8). */
export const GLOSSARY: Record<string, string> = Object.fromEntries(
  METRICS.map((m) => [m.key, m.description]),
);
