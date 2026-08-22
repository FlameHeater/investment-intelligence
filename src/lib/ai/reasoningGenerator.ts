import { askAi, currentModel, extractJson, GROUNDING_RULES } from "./client";
import { MODES } from "../modes";
import type { AiReasoning } from "../types";
import type { ScoreResult } from "../scoring/orchestrator";
import type { AssetSnapshot } from "../assetService";

/**
 * Fase 5 PRD: SATU pemanggilan Claude per aset, bukan 8 "agent" terpisah.
 *
 * Input yang dikirim sengaja dibuat berupa dump data terstruktur — sub-skor,
 * angka mentah pendukung, berita terbaru, dan timestamp semuanya. Model bertugas
 * MENJELASKAN data itu, bukan mengambil data baru.
 */

interface NewsInput {
  title: string;
  source: string;
  sourceType: string;
  sentiment: string | null;
  publishedAt: Date;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "tidak tersedia";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

export function buildReasoningPrompt(
  snapshot: AssetSnapshot,
  score: ScoreResult,
  news: NewsInput[],
): string {
  const mode = MODES[score.mode];
  const t = snapshot.technical;

  const dimensionBlock = (Object.keys(score.breakdown) as (keyof typeof score.breakdown)[])
    .map((k) => {
      const sub = score.breakdown[k];
      const inputs = Object.entries(sub.inputs)
        .map(([key, val]) => `      - ${key}: ${fmt(val)}`)
        .join("\n");
      return [
        `  ${k.toUpperCase()}`,
        `    skor: ${sub.score === null ? "TIDAK ADA DATA" : sub.score.toFixed(1)}`,
        `    bobot efektif: ${(score.effectiveWeights[k] * 100).toFixed(0)}%`,
        `    kelengkapan data: ${(sub.dataCompleteness * 100).toFixed(0)}%`,
        inputs ? `    angka mentah:\n${inputs}` : "    angka mentah: tidak ada",
        sub.notes.length ? `    catatan: ${sub.notes.join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const newsBlock =
    news.length === 0
      ? "  (tidak ada berita tersimpan untuk aset ini)"
      : news
          .map(
            (n) =>
              `  - [${n.publishedAt.toISOString().slice(0, 10)}] "${n.title}" — ${n.source} (jenis sumber: ${n.sourceType}, sentimen rule-based: ${n.sentiment ?? "netral"})`,
          )
          .join("\n");

  return `
ASET
  Ticker: ${snapshot.ticker}
  Nama: ${snapshot.name}
  Kelas aset: ${snapshot.assetType}
  Bursa: ${fmt(snapshot.exchange)}
  Mata uang: ${snapshot.currency}
  Sektor: ${fmt(snapshot.sector)}

KESEGARAN DATA
  Harga terakhir: ${fmt(snapshot.lastPriceAt?.toISOString())}
  Umur data harga: ${snapshot.priceAgeHours === null ? "tidak diketahui" : `${snapshot.priceAgeHours.toFixed(1)} jam`}
  Sumber harga: ${fmt(snapshot.source)}
  Label kesegaran: ${fmt(snapshot.freshness)}
  Ditandai basi (stale): ${snapshot.stale ? "YA" : "tidak"}
  Sumber fundamental: ${fmt(snapshot.fundamentalSource)}

HARGA & TEKNIKAL
  Harga: ${fmt(t.price)} ${snapshot.currency}
  Perubahan 1h/7h/30h/90h: ${fmt(t.change1d)}% / ${fmt(t.change7d)}% / ${fmt(t.change30d)}% / ${fmt(t.change90d)}%
  SMA 20/50/200: ${fmt(t.sma20)} / ${fmt(t.sma50)} / ${fmt(t.sma200)}
  RSI(14): ${fmt(t.rsi14)}
  MACD / signal / histogram: ${fmt(t.macd?.macd)} / ${fmt(t.macd?.signal)} / ${fmt(t.macd?.histogram)}
  Tren: ${fmt(t.trend)}
  52w high / low: ${fmt(t.high52w)} / ${fmt(t.low52w)}
  Jarak dari puncak 52w: ${fmt(t.distanceFromHigh52w)}%
  Volatilitas tahunan: ${t.volatility === null ? "tidak tersedia" : `${(t.volatility * 100).toFixed(1)}%`}
  Max drawdown: ${t.maxDrawdown === null ? "tidak tersedia" : `${(t.maxDrawdown * 100).toFixed(1)}%`}
  Jumlah bar historis: ${t.barCount}

MODE INVESTASI AKTIF: ${mode.label} — ${mode.tagline}
  ${mode.description}

SKOR
  Overall: ${score.overallScore} / 100
  Confidence: ${(score.confidence * 100).toFixed(0)}%
  Peringatan sistem: ${score.warnings.length ? score.warnings.join(" | ") : "tidak ada"}

BREAKDOWN PER DIMENSI
${dimensionBlock}

BERITA TERSIMPAN (maksimal 5 terbaru)
${newsBlock}
`.trim();
}

const SYSTEM = `
Anda adalah analis data investasi yang menjelaskan hasil perhitungan sebuah sistem skoring kepada satu pengguna personal di Indonesia.

Sistem sudah menghitung skor secara deterministik. Tugas Anda BUKAN menghitung ulang atau menilai ulang, melainkan menjelaskan: kenapa skornya begitu, apa yang mendukung, apa yang bertentangan, dan skenario apa yang masuk akal ke depan berdasarkan data yang ada.

${GROUNDING_RULES}

Aturan tambahan:
7. Setiap klaim di supportingFactors dan contradictingFactors HARUS menyebut angka konkret dari data yang diberikan.
8. Kalau sebuah dimensi bertanda "TIDAK ADA DATA", masukkan itu ke dataGaps — jangan diam-diam mengabaikannya.
9. Skenario bull/base/bear adalah deskripsi kondisi, bukan prediksi harga. Contoh yang benar: "Kalau margin bertahan di atas 20% dan tren harga tetap di atas SMA 50, kondisi saat ini bisa berlanjut." Contoh yang SALAH: "Harga berpotensi ke $250."

Jawab HANYA dengan objek JSON valid, tanpa teks lain, dengan bentuk:
{
  "summary": "2-4 kalimat ringkasan kondisi aset ini menurut data yang ada",
  "supportingFactors": ["faktor dengan angka konkret", "..."],
  "contradictingFactors": ["faktor dengan angka konkret", "..."],
  "dataGaps": ["data apa yang tidak tersedia dan bagaimana itu membatasi kesimpulan"],
  "scenarios": {
    "bull": "kondisi yang harus terjadi agar gambaran membaik",
    "base": "kelanjutan paling wajar dari kondisi sekarang",
    "bear": "kondisi yang membuat gambaran memburuk"
  }
}
`.trim();

export async function generateReasoning(
  snapshot: AssetSnapshot,
  score: ScoreResult,
  news: NewsInput[],
): Promise<AiReasoning> {
  const prompt = buildReasoningPrompt(snapshot, score, news.slice(0, 5));
  const text = await askAi({ system: SYSTEM, user: prompt, maxTokens: 2000 });

  const parsed = extractJson<Omit<AiReasoning, "generatedAt" | "model">>(text);
  if (!parsed?.summary) {
    throw new Error("Jawaban model tidak bisa diurai menjadi JSON reasoning yang valid.");
  }

  return {
    summary: parsed.summary,
    supportingFactors: parsed.supportingFactors ?? [],
    contradictingFactors: parsed.contradictingFactors ?? [],
    dataGaps: parsed.dataGaps ?? [],
    scenarios: {
      bull: parsed.scenarios?.bull ?? "tidak tersedia",
      base: parsed.scenarios?.base ?? "tidak tersedia",
      bear: parsed.scenarios?.bear ?? "tidak tersedia",
    },
    generatedAt: new Date().toISOString(),
    model: currentModel(),
  };
}
