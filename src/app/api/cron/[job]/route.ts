import { NextResponse } from "next/server";

/**
 * Endpoint untuk Vercel Cron (alternatif dari proses `npm run cron` lokal).
 *
 * Dilindungi CRON_SECRET, bukan cookie sesi — cron tidak punya sesi. Karena itu
 * jalur /api/cron sengaja dikecualikan dari middleware auth, dan otorisasinya
 * ditegakkan di sini.
 *
 * Catatan penting soal Vercel: fungsi serverless punya batas waktu eksekusi
 * (10-60 detik tergantung paket), sedangkan refreshMarketData untuk ~270 aset
 * dengan jeda rate limit butuh beberapa menit. Untuk deployment Vercel, jalankan
 * job berat di mesin lain (VPS/Raspberry Pi/GitHub Actions) yang menulis ke
 * database bersama, dan gunakan endpoint ini hanya untuk job ringan seperti
 * rescore dan deteksi perubahan watchlist.
 */

const JOBS = {
  rescore: () => import("@/lib/jobRunners").then((m) => m.runRescore()),
  watchlist: () => import("@/lib/jobRunners").then((m) => m.runWatchlistDetection()),
} as const;

type JobName = keyof typeof JOBS;

export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET belum diatur — endpoint cron dinonaktifkan." },
      { status: 503 },
    );
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const { job } = await params;
  if (!(job in JOBS)) {
    return NextResponse.json(
      { error: `Job "${job}" tidak dikenal. Tersedia: ${Object.keys(JOBS).join(", ")}.` },
      { status: 404 },
    );
  }

  try {
    const result = await JOBS[job as JobName]();
    return NextResponse.json({ job, success: true, ...result });
  } catch (err) {
    return NextResponse.json({ job, success: false, error: (err as Error).message }, { status: 500 });
  }
}
