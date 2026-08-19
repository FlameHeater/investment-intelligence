import { RateLimiter } from "./http";

/**
 * Fundamental saham IDX dari halaman publik Pluang.
 *
 * KENAPA ADA: PRD §4 mencatat tidak ada API resmi IDX yang gratis dan stabil
 * untuk data fundamental, sehingga 59 emiten IDX di aplikasi ini selama ini
 * tidak punya PER, PBV, ROE, maupun margin — dan confidence skornya tertahan di
 * sekitar 25%. Ini sumber gratis pertama yang menutup celah itu.
 *
 * STATUS HUKUM YANG HARUS DIINGAT: robots.txt Pluang mengizinkan jalur
 * /asset/indo-stock/* dan mendaftarkannya di sitemap agar diindeks, tapi
 * robots.txt mengatur PERAYAPAN UNTUK PENGINDEKSAN — bukan penggunaan ulang
 * datanya di produk lain. Pluang adalah platform komersial yang kemungkinan
 * melisensikan data fundamentalnya dari penyedia hulu, jadi risikonya bukan
 * hanya ToS mereka melainkan juga lisensi di atasnya.
 *
 * Karena itu sumber ini OPT-IN lewat ENABLE_PLUANG_SCRAPE dan mati secara
 * default. PRD §12 menyebut skenario ini sebagai yang membutuhkan tinjauan
 * hukum sungguhan kalau aplikasi dibagikan ke orang lain atau dimonetisasi.
 * Untuk alat pribadi single-user, itu keputusan pemiliknya.
 *
 * Alternatif berlisensi yang disebut PRD §13: Sectors.app (berbayar).
 */

// Jeda 2,5 detik. Jauh lebih longgar dari yang dibutuhkan, karena ini situs
// komersial yang tidak menjanjikan kuota apa pun kepada kita.
const limiter = new RateLimiter(2500);

export const PLUANG_SOURCE = "pluang_public_page";

export const pluangEnabled = () => process.env.ENABLE_PLUANG_SCRAPE === "true";

export interface PluangMetric {
  metric: string;
  value: number;
}

export interface PluangResult {
  metrics: PluangMetric[];
  /** teks periode pelaporan dari Pluang, mis. "Diperbarui 29 Jul 2026" */
  reportedLabel: string | null;
  reportedAt: Date | null;
}

/**
 * Mengurai angka bergaya Indonesia: titik sebagai pemisah ribuan, koma sebagai
 * desimal, plus satuan besar (T/M/jt/rb) dan imbuhan Rp/%/x.
 *
 * Mengembalikan null untuk "-" dan bentuk yang tidak dikenali — nilai yang tidak
 * bisa diurai TIDAK BOLEH menjadi 0, karena 0 adalah angka yang bermakna dalam
 * setiap rasio di aplikasi ini.
 */
export function parseIdNumber(raw: string): number | null {
  if (!raw) return null;
  const teks = raw.trim();
  if (teks === "-" || teks === "" || teks === "N/A") return null;

  const bersih = teks.replace(/Rp\s*/i, "").replace(/\s/g, "");
  const cocok = bersih.match(/^(-?[\d.,]+)\s*(T|M|jt|rb)?[%x]?$/i);
  if (!cocok) return null;

  const angka = Number(cocok[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(angka)) return null;

  const skala: Record<string, number> = { t: 1e12, m: 1e9, jt: 1e6, rb: 1e3 };
  const satuan = cocok[2]?.toLowerCase();
  return satuan ? angka * (skala[satuan] ?? 1) : angka;
}

/** "Diperbarui 29 Jul 2026" → Date */
function parseReportedAt(label: string | null): Date | null {
  if (!label) return null;
  const m = label.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return null;

  const bulan: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, mei: 4, jun: 5,
    jul: 6, aug: 7, agu: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11, des: 11,
  };
  const bln = bulan[m[2].toLowerCase()];
  if (bln === undefined) return null;

  const d = new Date(Date.UTC(Number(m[3]), bln, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Pemetaan field Pluang ke nama metrik internal aplikasi.
 *
 * `convert` menormalkan satuan; `sane` menolak nilai di luar rentang yang masuk
 * akal. Penolakan ini bukan kehati-hatian berlebihan — data yang salah satuan
 * akan menghasilkan skor yang salah TANPA jejak apa pun, yang jauh lebih buruk
 * daripada dimensi yang kosong dan diakui kosong.
 */
interface FieldSpec {
  metric: string;
  convert?: (v: number) => number;
  sane: (v: number) => boolean;
}

const RATIO_FIELDS: Record<string, FieldSpec> = {
  pe: { metric: "per", sane: (v) => v > -1000 && v < 2000 },
  pb: { metric: "pbv", sane: (v) => v > -100 && v < 500 },
  roe: { metric: "roe", sane: (v) => v > -200 && v < 300 },
  roa: { metric: "roa", sane: (v) => v > -200 && v < 300 },
  npm: { metric: "net_margin", sane: (v) => v > -500 && v < 200 },
  gpm: { metric: "gross_margin", sane: (v) => v > -500 && v < 200 },
  opm: { metric: "operating_margin", sane: (v) => v > -500 && v < 200 },
  ps: { metric: "price_to_sales", sane: (v) => v > 0 && v < 500 },
  ttm: { metric: "dividend_yield", sane: (v) => v >= 0 && v < 100 },

  // Pluang menampilkan `de` dengan imbuhan "%" tapi angkanya berperilaku sebagai
  // KELIPATAN: BBCA 4,6 (wajar untuk bank) dan TLKM 1,05 (wajar untuk telko).
  // Dibaca sebagai persen, keduanya jadi mustahil kecil. Jadi imbuhannya
  // diabaikan dan nilainya diperlakukan sebagai rasio — sama dengan satuan yang
  // dipakai Finnhub untuk saham AS, sehingga keduanya bisa dibandingkan.
  de: { metric: "debt_to_equity", sane: (v) => v >= 0 && v < 50 },

  // Sebaliknya, `cr` memang persen: TLKM 83,53% berarti rasio 0,84 — angka yang
  // wajar. Dibaca sebagai kelipatan, 83x mustahil.
  cr: { metric: "current_ratio", convert: (v) => v / 100, sane: (v) => v > 0 && v < 50 },
};

const OVERVIEW_FIELDS: Record<string, FieldSpec> = {
  eps: { metric: "eps", sane: (v) => Number.isFinite(v) },
  bvps: { metric: "book_value_per_share", sane: (v) => v > 0 },
  revenue: { metric: "revenue", sane: (v) => v > 0 },
  net_income: { metric: "net_income", sane: (v) => Number.isFinite(v) },
};

interface NextData {
  props?: {
    pageProps?: {
      assetFundamentals?: {
        earnings?: { lastUpdated?: string };
        overview?: { data?: { key: string; value: string }[] };
        ratios?: { key: string; fields: { key: string; value: string }[] }[];
      };
    };
  };
}

const NEXT_DATA_RE =
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

/**
 * @param ticker kode emiten apa adanya dari database, mis. "BBCA.JK"
 */
export async function fetchPluangFundamentals(ticker: string): Promise<PluangResult> {
  const kosong: PluangResult = { metrics: [], reportedLabel: null, reportedAt: null };
  if (!pluangEnabled()) return kosong;

  const kode = ticker.replace(/\.JK$/i, "").toUpperCase();

  let html: string;
  try {
    html = await limiter.run(async () => {
      const res = await fetch(`https://pluang.com/asset/indo-stock/${kode}/fundamentals`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
  } catch {
    // Kegagalan satu emiten tidak boleh menggagalkan seluruh job.
    return kosong;
  }

  const cocok = html.match(NEXT_DATA_RE);
  if (!cocok) return kosong;

  let fundamentals: NonNullable<
    NonNullable<NextData["props"]>["pageProps"]
  >["assetFundamentals"];
  try {
    fundamentals = (JSON.parse(cocok[1]) as NextData).props?.pageProps?.assetFundamentals;
  } catch {
    return kosong;
  }
  if (!fundamentals) return kosong;

  const metrics: PluangMetric[] = [];

  const ambil = (key: string, raw: string, spec: FieldSpec | undefined) => {
    if (!spec) return;
    const angka = parseIdNumber(raw);
    if (angka === null) return;
    const nilai = spec.convert ? spec.convert(angka) : angka;
    // Nilai di luar rentang wajar dibuang, bukan disimpan apa adanya.
    if (!spec.sane(nilai)) return;
    metrics.push({ metric: spec.metric, value: nilai });
  };

  for (const item of fundamentals.overview?.data ?? []) {
    ambil(item.key, item.value, OVERVIEW_FIELDS[item.key]);
  }
  for (const grup of fundamentals.ratios ?? []) {
    for (const field of grup.fields) {
      ambil(field.key, field.value, RATIO_FIELDS[field.key]);
    }
  }

  const reportedLabel = fundamentals.earnings?.lastUpdated ?? null;

  return { metrics, reportedLabel, reportedAt: parseReportedAt(reportedLabel) };
}
