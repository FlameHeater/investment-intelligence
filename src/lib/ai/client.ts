import Anthropic from "@anthropic-ai/sdk";

/**
 * Satu pintu untuk semua panggilan Claude.
 *
 * Prinsip PRD §6.1 & §14: model hanya menerima data yang SUDAH diambil dari
 * database. Tidak ada tool, tidak ada web access, tidak ada perintah "cari tahu
 * sendiri". Kalau sebuah angka tidak ada di prompt, model tidak boleh
 * menyebutkannya — dan itu dinyatakan eksplisit di system prompt tiap pemanggil.
 */

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiDisabledError();
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export class AiDisabledError extends Error {
  constructor() {
    super(
      "Fitur AI tidak aktif karena ANTHROPIC_API_KEY belum diisi. Semua skor deterministik tetap berjalan tanpa ini.",
    );
    this.name = "AiDisabledError";
  }
}

export interface AskOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export async function askClaude(opts: AskOptions): Promise<string> {
  const response = await getClient().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 2000,
    temperature: opts.temperature ?? 0.2,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Mengambil objek JSON pertama dari teks jawaban.
 * Model kadang membungkus JSON dalam blok kode atau kalimat pengantar; ini
 * menanganinya tanpa perlu memaksa mode JSON yang membatasi kualitas reasoning.
 */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Aturan anti-halusinasi yang dipakai ulang di semua system prompt. */
export const GROUNDING_RULES = `
ATURAN WAJIB (melanggar salah satu = jawaban tidak terpakai):
1. Gunakan HANYA angka, tanggal, dan berita yang ada di dalam data yang diberikan. Dilarang menambahkan fakta dari ingatan Anda tentang perusahaan/aset ini.
2. Kalau sebuah data tidak ada di input, katakan "data tidak tersedia" — jangan memperkirakan, jangan mengisi dari pengetahuan umum.
3. Kalau data ditandai delayed atau stale, sebutkan keterbatasan itu dalam analisis.
4. Dilarang memberi rekomendasi beli/jual/hold. Anda menjelaskan kondisi dan skenario, bukan menyuruh bertransaksi.
5. Dilarang menjanjikan atau memperkirakan target harga spesifik.
6. Tulis dalam Bahasa Indonesia yang lugas. Hindari jargon tanpa penjelasan.
`.trim();
