import { askAi, GROUNDING_RULES } from "./client";
import { GLOSSARY } from "../metrics";

/**
 * Fase 8 PRD: Contextual Education.
 *
 * Berbeda dari reasoning generator, di sini model BOLEH memakai pengetahuan umum
 * keuangan — karena yang ditanyakan adalah konsep ("apa itu ROE"), bukan fakta
 * tentang sebuah aset. Batasnya tetap tegas: begitu pertanyaannya menyangkut
 * angka aset tertentu, model harus mengarahkan pengguna ke halaman aset alih-alih
 * mengarang angka.
 */

const SYSTEM = `
Anda guru keuangan personal yang menjelaskan istilah investasi kepada seorang pembelajar di Indonesia.

Gaya menjawab:
- Bahasa Indonesia yang sederhana, tanpa jargon berlapis.
- Mulai dari definisi satu kalimat, lalu analogi atau contoh angka sederhana, lalu satu kalimat tentang batasan/kesalahpahaman umum.
- Panjang jawaban maksimal 200 kata.

${GROUNDING_RULES}

Aturan khusus:
7. Anda BOLEH menjelaskan konsep keuangan umum dari pengetahuan Anda — itu memang tugas Anda di sini.
8. Anda TIDAK BOLEH menyebut angka spesifik milik sebuah perusahaan/aset (harga, ROE, PER, dsb) kecuali angka itu diberikan dalam konteks. Kalau ditanya soal angka aset tertentu tanpa konteks, katakan bahwa angkanya bisa dilihat di halaman aset tersebut.
9. Jangan menyarankan aset apa pun untuk dibeli atau dijual.
`.trim();

export interface ExplainRequest {
  /** kunci metrik (mis. "roe") atau pertanyaan bebas */
  term?: string;
  question?: string;
  /** konteks opsional: angka yang sedang dilihat pengguna di layar */
  context?: Record<string, string | number | null>;
}

export async function explain(req: ExplainRequest): Promise<string> {
  const baseline = req.term ? GLOSSARY[req.term] : undefined;

  const contextBlock = req.context
    ? `\n\nKonteks angka yang sedang dilihat pengguna (boleh dipakai):\n${Object.entries(req.context)
        .map(([k, v]) => `- ${k}: ${v ?? "tidak tersedia"}`)
        .join("\n")}`
    : "";

  const user = req.question
    ? `Pertanyaan pengguna: ${req.question}${contextBlock}`
    : `Jelaskan istilah "${req.term}".${
        baseline ? `\n\nDefinisi singkat yang sudah ada di aplikasi: ${baseline}` : ""
      }${contextBlock}`;

  return askAi({ system: SYSTEM, user, maxTokens: 700, temperature: 0.3 });
}

/**
 * Penjelasan perubahan pada watchlist (Fase 7 PRD).
 * Sengaja dipisah dari `explain` karena aturannya lebih ketat: ini menyangkut
 * angka nyata sebuah aset, jadi berlaku grounding penuh.
 */
const CHANGE_SYSTEM = `
Anda menjelaskan KENAPA sebuah aset di watchlist berubah, kepada satu pengguna personal.

${GROUNDING_RULES}

Aturan tambahan:
7. Maksimal 3 kalimat.
8. Hubungkan perubahan skor dengan penyebabnya yang terlihat di data (perubahan harga, indikator teknikal, berita baru, atau perubahan metrik fundamental).
9. Kalau penyebabnya tidak bisa dipastikan dari data yang ada, katakan begitu — jangan menebak.
`.trim();

export async function explainChange(payload: {
  ticker: string;
  name: string;
  previous: Record<string, unknown>;
  current: Record<string, unknown>;
  recentNews: { title: string; source: string; publishedAt: Date }[];
}): Promise<string> {
  const newsBlock =
    payload.recentNews.length === 0
      ? "(tidak ada berita baru tersimpan)"
      : payload.recentNews
          .map((n) => `- [${n.publishedAt.toISOString().slice(0, 10)}] "${n.title}" — ${n.source}`)
          .join("\n");

  return askAi({
    system: CHANGE_SYSTEM,
    maxTokens: 500,
    user: `
Aset: ${payload.ticker} — ${payload.name}

KONDISI SEBELUMNYA:
${JSON.stringify(payload.previous, null, 2)}

KONDISI SEKARANG:
${JSON.stringify(payload.current, null, 2)}

BERITA TERBARU:
${newsBlock}
`.trim(),
  });
}
