import { askClaude, extractJson, GROUNDING_RULES } from "./client";
import { METRICS } from "../metrics";
import { screenerQuerySchema, type ScreenerQuery, type ScreenerResult } from "../screener";

/**
 * Fase 6 PRD: bahasa natural → objek filter → dijalankan mesin screener yang sama.
 *
 * Model TIDAK pernah menyentuh database dan tidak pernah memilih aset sendiri.
 * Ia hanya menerjemahkan kalimat menjadi filter. Kalau terjemahannya salah,
 * penggunanya bisa melihat filter yang dihasilkan di UI dan mengoreksinya —
 * itu sebabnya `interpretation` dan filter mentah ikut dikembalikan.
 */

const metricCatalog = METRICS.map(
  (m) =>
    `- ${m.key} (${m.label}, satuan: ${m.format}, tersedia untuk: ${m.availableFor.join(", ")})`,
).join("\n");

const SYSTEM = `
Anda menerjemahkan permintaan screening investasi dalam bahasa sehari-hari menjadi filter terstruktur.

METRIK YANG TERSEDIA (hanya ini, tidak ada yang lain):
${metricCatalog}

KELAS ASET: us_stock (saham AS), idx_stock (saham Indonesia), crypto (kripto), gold (emas)

${GROUNDING_RULES}

Aturan khusus penerjemahan:
7. Kalau pengguna meminta metrik yang tidak ada di daftar, JANGAN mengarang nama metrik. Masukkan penjelasannya ke "unsupported".
8. Satuan persen ditulis sebagai angka biasa: "margin di atas 20%" menjadi value 20, bukan 0.2.
9. Filter fundamental (roe, per, pbv, margin, dst) hanya berlaku untuk us_stock. Kalau pengguna memintanya untuk saham Indonesia, tetap buat filternya, tapi catat di "unsupported" bahwa data fundamental IDX tidak tersedia di sumber gratis sehingga hasilnya akan kosong.
10. Kalau pengguna tidak menyebut kelas aset, biarkan assetTypes kosong (berarti semua).

Jawab HANYA dengan JSON valid berbentuk:
{
  "interpretation": "satu kalimat berisi bagaimana Anda memahami permintaan itu",
  "assetTypes": ["us_stock"],
  "filters": [{"metric": "roe", "operator": "gt", "value": 15}],
  "sortBy": "overall_score",
  "sortDir": "desc",
  "unsupported": ["bagian permintaan yang tidak bisa diterjemahkan, beserta alasannya"]
}

Operator yang sah: gt, gte, lt, lte, eq, between (between memakai "value" dan "value2").
`.trim();

export interface ParsedScreenerQuery {
  interpretation: string;
  query: ScreenerQuery;
  unsupported: string[];
}

export async function parseNaturalQuery(input: string): Promise<ParsedScreenerQuery> {
  const text = await askClaude({
    system: SYSTEM,
    user: `Permintaan pengguna: "${input}"`,
    maxTokens: 1200,
  });

  const raw = extractJson<{
    interpretation?: string;
    assetTypes?: string[];
    filters?: unknown[];
    sortBy?: string;
    sortDir?: string;
    unsupported?: string[];
  }>(text);

  if (!raw) {
    throw new Error("Model tidak mengembalikan JSON filter yang bisa diurai.");
  }

  // Validasi ketat: apa pun yang tidak lolos skema dibuang, bukan dipaksa masuk.
  const parsed = screenerQuerySchema.safeParse({
    assetTypes: raw.assetTypes ?? [],
    filters: raw.filters ?? [],
    sortBy: raw.sortBy ?? "overall_score",
    sortDir: raw.sortDir === "asc" ? "asc" : "desc",
    limit: 50,
  });

  if (!parsed.success) {
    throw new Error(
      `Filter hasil terjemahan tidak valid: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  return {
    interpretation: raw.interpretation ?? "(tidak ada penjelasan dari model)",
    query: parsed.data,
    unsupported: raw.unsupported ?? [],
  };
}

const SUMMARY_SYSTEM = `
Anda meringkas hasil screening investasi untuk satu pengguna personal di Indonesia.

${GROUNDING_RULES}

Aturan tambahan:
7. Ringkas dalam 3-5 kalimat. Sebutkan berapa aset yang lolos, pola apa yang terlihat di antara mereka, dan satu hal yang perlu diwaspadai dari data itu sendiri (mis. confidence rendah, data basi, atau banyak aset tersaring karena datanya kosong).
8. Kalau hasilnya kosong, jelaskan kemungkinan penyebabnya berdasarkan catatan yang diberikan — jangan menyarankan aset lain di luar hasil.
9. Jangan menyebut satu aset sebagai pilihan terbaik.
`.trim();

export async function summarizeScreenerResult(
  userQuery: string,
  parsed: ParsedScreenerQuery,
  result: ScreenerResult,
): Promise<string> {
  const rowsBlock =
    result.rows.length === 0
      ? "(tidak ada aset yang lolos filter)"
      : result.rows
          .slice(0, 15)
          .map(
            (r) =>
              `- ${r.ticker} (${r.name}, ${r.assetType}): score ${r.overallScore ?? "n/a"}, confidence ${r.confidence === null ? "n/a" : `${(r.confidence * 100).toFixed(0)}%`}, harga ${r.values.price ?? "n/a"}, 30h ${r.values.change30d?.toFixed(1) ?? "n/a"}%, ROE ${r.values.roe ?? "n/a"}, PER ${r.values.per ?? "n/a"}${r.stale ? " [DATA BASI]" : ""}`,
          )
          .join("\n");

  return askClaude({
    system: SUMMARY_SYSTEM,
    maxTokens: 800,
    user: `
Permintaan asli pengguna: "${userQuery}"
Interpretasi sistem: ${parsed.interpretation}
Filter yang dijalankan: ${JSON.stringify(parsed.query.filters)}
Kelas aset: ${parsed.query.assetTypes.length ? parsed.query.assetTypes.join(", ") : "semua"}
Bagian yang tidak bisa diterjemahkan: ${parsed.unsupported.length ? parsed.unsupported.join("; ") : "tidak ada"}

Jumlah aset lolos: ${result.total}
Aset tersaring karena data kosong: ${result.excludedForMissingData}
Catatan sistem: ${result.notes.length ? result.notes.join(" | ") : "tidak ada"}

HASIL (maksimal 15 teratas):
${rowsBlock}
`.trim(),
  });
}
