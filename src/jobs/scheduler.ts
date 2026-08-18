import { config } from "dotenv";
import { spawn } from "node:child_process";
import cron from "node-cron";

config();

/**
 * Proses cron terpisah (PRD §6.1). Jalankan dengan `npm run cron` di terminal
 * kedua saat pengembangan lokal.
 *
 * Kalau di-deploy ke Vercel, file ini TIDAK dipakai — gunakan Vercel Cron yang
 * memanggil endpoint /api/cron/[job] (lihat vercel.json).
 *
 * Semua jadwal memakai zona waktu Asia/Jakarta.
 */

const TZ = "Asia/Jakarta";

function run(script: string, args: string[] = []) {
  const child = spawn("npx", ["tsx", `src/jobs/${script}.ts`, ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("error", (err) => console.error(`Gagal menjalankan ${script}: ${err.message}`));
}

const schedules: { expr: string; label: string; fn: () => void }[] = [
  {
    // Tiap 30 menit pada jam bursa IDX (09:00-16:00 WIB, Senin-Jumat).
    expr: "*/30 9-16 * * 1-5",
    label: "refreshMarketData (jam bursa IDX)",
    fn: () => run("refreshMarketData", ["--only=idx"]),
  },
  {
    // Tiap 30 menit pada jam bursa AS (21:30-04:00 WIB) — dibulatkan ke 21-23 & 0-4.
    expr: "*/30 21-23,0-4 * * 1-6",
    label: "refreshMarketData (jam bursa AS + emas)",
    fn: () => run("refreshMarketData", ["--only=us,gold"]),
  },
  {
    // Kripto tidak libur.
    expr: "*/30 * * * *",
    label: "refreshMarketData (kripto)",
    fn: () => run("refreshMarketData", ["--only=crypto"]),
  },
  {
    expr: "15 6 * * *",
    label: "refreshFundamentals (harian 06:15)",
    fn: () => run("refreshFundamentals"),
  },
  {
    expr: "30 6,18 * * *",
    label: "refreshNews (2x sehari)",
    fn: () => run("refreshNews"),
  },
  {
    expr: "0 7,19 * * *",
    label: "rescoreUniverse (2x sehari)",
    fn: () => run("rescoreUniverse"),
  },
  {
    expr: "20 7,19 * * *",
    label: "detectWatchlistChanges (setelah scoring)",
    fn: () => run("detectWatchlistChanges"),
  },
];

console.log("Scheduler aktif (zona waktu Asia/Jakarta). Tekan Ctrl+C untuk berhenti.\n");
for (const s of schedules) {
  cron.schedule(s.expr, s.fn, { timezone: TZ });
  console.log(`  ${s.expr.padEnd(22)} → ${s.label}`);
}
console.log("");
