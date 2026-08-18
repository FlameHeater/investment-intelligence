import type { Sentiment, SubScore } from "../types";
import { emptyScore, type ScoringContext } from "./shared";

/**
 * Sentimen berita, 0-100. RULE-BASED, bukan model ML (PRD §6.3).
 *
 * Alasan memilih keyword matching: hasilnya bisa diaudit baris demi baris, dan
 * kalau salah, penyebabnya kelihatan. Model sentimen black-box justru melanggar
 * prinsip "Transparency Over Black Box" (PRD §14) untuk keuntungan akurasi yang
 * tidak seberapa pada judul berita pendek.
 *
 * Keterbatasan yang diakui: hanya menangkap kata kunci Inggris & Indonesia yang
 * terdaftar, dan tidak memahami negasi ("gagal tumbuh"). Ini tercatat di notes.
 */

const POSITIVE = [
  "beat", "beats", "surge", "surges", "rally", "record high", "record profit", "upgrade",
  "upgraded", "outperform", "growth", "profit rises", "strong demand", "expansion", "buyback",
  "dividend increase", "raises guidance", "approval", "partnership", "wins", "breakthrough",
  "naik", "melonjak", "untung", "laba naik", "rekor", "ekspansi", "kerja sama", "tumbuh",
  "positif", "menguat", "dividen naik",
];

const NEGATIVE = [
  "miss", "misses", "plunge", "plunges", "slump", "downgrade", "downgraded", "underperform",
  "lawsuit", "probe", "investigation", "recall", "layoff", "layoffs", "cuts guidance", "loss",
  "bankruptcy", "fraud", "delay", "warns", "warning", "decline", "falls", "halt", "suspended",
  "turun", "anjlok", "merugi", "rugi", "gugatan", "penyelidikan", "phk", "melemah", "negatif",
  "denda", "sanksi", "gagal", "dibekukan",
];

/** Dipakai juga oleh job ingest berita untuk mengisi kolom `sentiment`. */
export function classifySentiment(title: string, summary?: string | null): Sentiment {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE) if (text.includes(w)) pos++;
  for (const w of NEGATIVE) if (text.includes(w)) neg++;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

export function sentimentScore(ctx: ScoringContext): SubScore {
  const recent = ctx.news.filter(
    (n) => Date.now() - n.publishedAt.getTime() < 14 * 86_400_000,
  );

  if (recent.length === 0) {
    return emptyScore(
      "Tidak ada berita tersimpan dalam 14 hari terakhir. Dimensi sentimen dikosongkan — bukan dianggap netral.",
    );
  }

  // Berita dari sumber resmi diberi bobot lebih besar daripada media umum,
  // dan sumber social/unverified diberi bobot paling kecil (PRD §5 poin 7).
  const weightOf = (t: string) =>
    t === "official" ? 1.5 : t === "media" ? 1 : 0.5;

  let weighted = 0;
  let totalWeight = 0;
  let pos = 0;
  let neg = 0;
  let neu = 0;

  for (const n of recent) {
    const s = (n.sentiment ?? "neutral") as Sentiment;
    if (s === "positive") pos++;
    else if (s === "negative") neg++;
    else neu++;

    const w = weightOf(n.sourceType);
    const value = s === "positive" ? 100 : s === "negative" ? 0 : 50;
    weighted += value * w;
    totalWeight += w;
  }

  const score = totalWeight > 0 ? weighted / totalWeight : null;

  // Sedikit berita = sinyal lemah. Ini tercermin di completeness, bukan di skor.
  const completeness = Math.min(1, recent.length / 8);

  const notes = [
    "Sentimen dihitung dengan pencocokan kata kunci sederhana (rule-based), bukan model bahasa. Nuansa dan negasi bisa terlewat.",
  ];
  if (recent.length < 4) {
    notes.push(`Hanya ${recent.length} berita dalam 14 hari terakhir — sinyal sentimen lemah.`);
  }

  return {
    score,
    dataCompleteness: completeness,
    inputs: {
      news_count_14d: recent.length,
      positive: pos,
      neutral: neu,
      negative: neg,
    },
    notes,
  };
}
