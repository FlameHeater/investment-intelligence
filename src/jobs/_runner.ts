import { config } from "dotenv";
import { prisma } from "../lib/db";

/**
 * Kerangka bersama untuk semua job terjadwal.
 * Setiap job mencatat hasilnya ke tabel job_runs supaya UI bisa menampilkan
 * "terakhir diperbarui X jam lalu" — persyaratan PRD §7 poin 5.
 */

// Job dijalankan lewat tsx di luar Next.js, jadi .env harus dimuat manual.
config();

export interface JobResult {
  ok: number;
  failed: number;
  message?: string;
}

export async function runJob(name: string, fn: () => Promise<JobResult>): Promise<void> {
  const startedAt = new Date();
  const record = await prisma.jobRun.create({
    data: { job: name, status: "running", startedAt },
  });

  const t0 = Date.now();
  console.log(`\n▶  ${name} dimulai ${startedAt.toLocaleString("id-ID")}`);

  try {
    const result = await fn();
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);

    await prisma.jobRun.update({
      where: { id: record.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        ok: result.ok,
        failed: result.failed,
        message: result.message,
      },
    });

    console.log(`✔  ${name} selesai dalam ${seconds}s — berhasil: ${result.ok}, gagal: ${result.failed}`);
    if (result.message) console.log(`   ${result.message}`);
  } catch (err) {
    await prisma.jobRun.update({
      where: { id: record.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        message: (err as Error).message,
      },
    });
    console.error(`✖  ${name} gagal: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

/** Dipakai job yang dijalankan langsung dari CLI. */
export async function finish(): Promise<void> {
  await prisma.$disconnect();
}

/** Progress bar sederhana untuk job yang panjang. */
export function progress(current: number, total: number, label: string): void {
  if (current % 10 !== 0 && current !== total) return;
  const pct = ((current / total) * 100).toFixed(0);
  process.stdout.write(`\r   ${label}: ${current}/${total} (${pct}%)          `);
  if (current === total) process.stdout.write("\n");
}
