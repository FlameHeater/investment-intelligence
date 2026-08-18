import type { SubScore } from "../types";
import { combine, emptyScore, scale, type ScoringContext } from "./shared";

/**
 * Skor kewajaran harga, 0-100. Skor tinggi = relatif murah.
 *
 * PRD §8 menyebut valuasi dinilai terhadap histori dan peer. Di MVP, pembanding
 * peer belum tersedia (butuh agregasi sektor lintas provider), jadi acuan yang
 * dipakai adalah rentang absolut yang lazim untuk saham besar. Keterbatasan ini
 * dicatat eksplisit di `notes` supaya muncul di UI, bukan disembunyikan.
 */
export function valuationScore(ctx: ScoringContext): SubScore {
  if (ctx.assetType === "crypto") {
    return emptyScore(
      "Kripto tidak punya laba atau nilai buku, sehingga PER/PBV tidak berlaku. Dimensi valuasi tidak dipakai.",
    );
  }
  if (ctx.assetType === "gold") {
    return emptyScore("Emas tidak menghasilkan laba — tidak ada metrik valuasi yang berlaku.");
  }

  const f = ctx.fundamentals;
  const per = f.get("per") ?? null;
  const pbv = f.get("pbv") ?? null;
  const divYield = f.get("dividend_yield") ?? null;

  // PER negatif berarti perusahaan rugi — bukan "murah". Ditandai terpisah.
  const perScore = per === null ? null : per <= 0 ? 10 : scale(per, 45, 8);
  const pbvScore = pbv === null ? null : pbv <= 0 ? 10 : scale(pbv, 8, 1);
  const divScore = divYield === null ? null : scale(divYield, 0, 5);

  const components = [
    { score: perScore, weight: 0.5 },
    { score: pbvScore, weight: 0.35 },
    { score: divScore, weight: 0.15 },
  ];

  const { score, completeness } = combine(components);
  const notes: string[] = [
    "Pembanding valuasi memakai rentang absolut, belum dibandingkan dengan rata-rata sektor (peer comparison masuk Phase 2, PRD §8).",
  ];

  if (score === null) {
    notes.unshift(
      ctx.assetType === "idx_stock"
        ? "Data valuasi IDX (PER/PBV) tidak tersedia di sumber gratis — lihat PRD §4."
        : "Belum ada data valuasi tersimpan. Isi FINNHUB_API_KEY lalu jalankan `npm run job:fundamentals`.",
    );
  }
  if (per !== null && per <= 0) {
    notes.unshift("PER negatif karena perusahaan sedang merugi — angka ini tidak bisa dibaca sebagai murah.");
  }

  return {
    score,
    dataCompleteness: completeness,
    inputs: { per, pbv, dividend_yield: divYield },
    notes,
  };
}
