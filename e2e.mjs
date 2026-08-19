process.env.ENABLE_PLUANG_SCRAPE = "true";

const { PrismaClient } = await import("@prisma/client");
const { refreshFundamentals } = await import("./src/lib/refreshJobs.ts");
const { computeScore } = await import("./src/lib/scoring/orchestrator.ts");
const { buildScoringContext } = await import("./src/lib/assetService.ts");
const { metricsFor } = await import("./src/lib/metrics.ts");

const prisma = new PrismaClient();

// Batasi ke beberapa emiten agar uji cepat: sisanya dihapus sementara dari
// pertimbangan dengan memfilter di level query tidak mungkin, jadi cukup lihat
// hasil untuk tiga emiten setelah job berjalan penuh.
console.log("metrik IDX yang ditawarkan sekarang:");
console.log("  " + metricsFor("idx_stock").map((m) => m.key).join(", "));

const t0 = Date.now();
const hasil = await refreshFundamentals({
  onProgress: (d, t, l) => {
    if (d % 25 === 0) console.log(`  ${d}/${t} ${l}`);
  },
});
console.log(`\nselesai dalam ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log("  " + hasil.message);

for (const ticker of ["BBCA.JK", "TLKM.JK", "GOTO.JK"]) {
  const asset = await prisma.asset.findFirst({ where: { ticker } });
  if (!asset) continue;

  const rows = await prisma.fundamentalData.findMany({ where: { assetId: asset.id } });
  const ctx = await buildScoringContext(asset);
  const skor = computeScore(ctx, "investor");

  console.log(`\n${ticker}: ${rows.length} metrik | sumber=${rows[0]?.source ?? "-"}`);
  console.log(
    `  skor=${skor.overallScore} confidence=${(skor.confidence * 100).toFixed(0)}%` +
      `  fundamental=${skor.breakdown.fundamental.score?.toFixed(1) ?? "n/a"}` +
      `  valuasi=${skor.breakdown.valuation.score?.toFixed(1) ?? "n/a"}`,
  );
}

await prisma.$disconnect();
