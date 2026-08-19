import { prisma } from "./db";
import { refreshFundamentals, refreshMarketData, refreshNews, type AssetScope } from "./refreshJobs";
import { runRescore } from "./jobRunners";
import { invalidateUniverseCache } from "./universeSnapshot";
import type { JobOutcome } from "./jobRunners";

/**
 * Menjalankan seluruh pipeline data dari satu tombol di UI.
 *
 * Ada kendala nyata yang tidak bisa disembunyikan: mengambil ~270 aset butuh
 * 15-25 menit karena limiter provider gratis, sedangkan fungsi serverless Vercel
 * dihentikan setelah beberapa puluh detik dan pekerjaan latar apa pun ikut mati
 * begitu response dikirim. Jadi ada dua jalur, dan UI menyatakan yang mana yang
 * sedang berlaku alih-alih menampilkan tombol yang diam-diam tidak bekerja:
 *
 *   1. Server berumur panjang (lokal, VPS, Raspberry Pi) → dijalankan langsung
 *      di proses ini, progresnya bisa dipantau.
 *   2. Vercel → memicu workflow GitHub Actions lewat API, karena runner GitHub
 *      punya batas 6 jam dan memang dirancang untuk pekerjaan sepanjang ini.
 */

export type RefreshMode = "in_process" | "github_actions" | "unavailable";

export interface RefreshStep {
  key: string;
  label: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  detail?: string;
  progress?: { done: number; total: number; label: string };
}

export interface RefreshState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  steps: RefreshStep[];
  error: string | null;
  /** hanya terisi pada mode github_actions */
  externalUrl?: string;
}

const onVercel = () => Boolean(process.env.VERCEL);
const githubConfigured = () =>
  Boolean(process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_REPOSITORY);

export function refreshMode(): RefreshMode {
  if (!onVercel()) return "in_process";
  if (githubConfigured()) return "github_actions";
  return "unavailable";
}

export function refreshModeExplanation(): string {
  switch (refreshMode()) {
    case "in_process":
      return "Refresh dijalankan langsung oleh server ini. Prosesnya 15-25 menit karena provider gratis membatasi laju permintaan; Anda boleh menutup halaman, job tetap berjalan.";
    case "github_actions":
      return "Aplikasi berjalan di Vercel, yang menghentikan fungsi setelah beberapa puluh detik. Tombol ini memicu workflow GitHub Actions yang menarik data ke database yang sama.";
    default:
      return "Refresh dari tombol belum tersedia di deployment ini. Vercel menghentikan fungsi serverless jauh sebelum penarikan data selesai, dan GITHUB_DISPATCH_TOKEN belum diisi sehingga workflow GitHub Actions tidak bisa dipicu dari sini.";
  }
}

// ── Status in-process ─────────────────────────────────────────────────────
// Disimpan di memori proses. Cukup untuk pemakaian single-user; kalau server
// di-restart di tengah job, status hilang tapi tabel job_runs tetap mencatat
// apa yang sudah selesai.
const IDLE: RefreshState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  steps: [],
  error: null,
};

let state: RefreshState = IDLE;

export function getRefreshState(): RefreshState {
  return state;
}

function buildSteps(only?: AssetScope[]): RefreshStep[] {
  const scopeLabel = only?.length ? ` (${only.join(", ")})` : "";
  return [
    { key: "market", label: `Harga & volume${scopeLabel}`, status: "pending" },
    { key: "fundamentals", label: "Fundamental saham AS", status: "pending" },
    { key: "news", label: "Berita & sentimen", status: "pending" },
    { key: "score", label: "Hitung ulang Investment Score", status: "pending" },
  ];
}

function setStep(key: string, patch: Partial<RefreshStep>) {
  state = {
    ...state,
    steps: state.steps.map((s) => (s.key === key ? { ...s, ...patch } : s)),
  };
}

/** Mencatat hasil ke job_runs supaya muncul di panel status pipeline. */
async function record(job: string, fn: () => Promise<JobOutcome>): Promise<JobOutcome> {
  const started = new Date();
  const row = await prisma.jobRun.create({
    data: { job, status: "running", startedAt: started },
  });

  try {
    const result = await fn();
    await prisma.jobRun.update({
      where: { id: row.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        ok: result.ok,
        failed: result.failed,
        message: result.message,
      },
    });
    return result;
  } catch (err) {
    await prisma.jobRun.update({
      where: { id: row.id },
      data: { status: "error", finishedAt: new Date(), message: (err as Error).message },
    });
    throw err;
  }
}

async function runPipeline(only?: AssetScope[]): Promise<void> {
  try {
    setStep("market", { status: "running" });
    const market = await record("refreshMarketData", () =>
      refreshMarketData({
        only,
        onProgress: (done, total, label) =>
          setStep("market", { progress: { done, total, label } }),
      }),
    );
    setStep("market", {
      status: "success",
      detail: `${market.ok} aset diperbarui, ${market.failed} gagal. ${market.message}`,
      progress: undefined,
    });

    setStep("fundamentals", { status: "running" });
    const fundamentals = await record("refreshFundamentals", () =>
      refreshFundamentals({
        onProgress: (done, total, label) =>
          setStep("fundamentals", { progress: { done, total, label } }),
      }),
    );
    setStep("fundamentals", {
      status: fundamentals.ok === 0 && fundamentals.failed === 0 ? "skipped" : "success",
      detail: fundamentals.message,
      progress: undefined,
    });

    setStep("news", { status: "running" });
    const news = await record("refreshNews", () =>
      refreshNews({
        onProgress: (done, total, label) => setStep("news", { progress: { done, total, label } }),
      }),
    );
    setStep("news", {
      status: news.ok === 0 && news.failed === 0 ? "skipped" : "success",
      detail: news.message,
      progress: undefined,
    });

    setStep("score", { status: "running" });
    const score = await record("rescoreUniverse", () => runRescore());
    setStep("score", { status: "success", detail: score.message });

    invalidateUniverseCache();
    state = { ...state, running: false, finishedAt: new Date().toISOString() };
  } catch (err) {
    const message = (err as Error).message;
    state = {
      ...state,
      running: false,
      finishedAt: new Date().toISOString(),
      error: message,
      steps: state.steps.map((s) =>
        s.status === "running" ? { ...s, status: "error", detail: message } : s,
      ),
    };
  }
}

export interface StartResult {
  started: boolean;
  mode: RefreshMode;
  message: string;
  externalUrl?: string;
}

export async function startRefresh(only?: AssetScope[]): Promise<StartResult> {
  const mode = refreshMode();

  if (mode === "unavailable") {
    return { started: false, mode, message: refreshModeExplanation() };
  }

  if (mode === "github_actions") {
    return dispatchGithubWorkflow();
  }

  if (state.running) {
    return {
      started: false,
      mode,
      message: "Refresh sedang berjalan. Tunggu sampai selesai sebelum memulai yang baru.",
    };
  }

  state = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: buildSteps(only),
    error: null,
  };

  // Sengaja TIDAK di-await: response harus kembali segera supaya UI bisa
  // menampilkan progres, bukan menggantung 20 menit sampai timeout.
  void runPipeline(only);

  return { started: true, mode, message: "Refresh dimulai." };
}

async function dispatchGithubWorkflow(): Promise<StartResult> {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const workflow = process.env.GITHUB_WORKFLOW_FILE || "refresh-data.yml";
  const ref = process.env.GITHUB_REF_NAME || "main";

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs: { seed: "false" } }),
    },
  );

  if (res.status === 204) {
    return {
      started: true,
      mode: "github_actions",
      message:
        "Workflow GitHub Actions dipicu. Data akan masuk ke database dalam 15-25 menit; halaman ini akan menampilkannya begitu selesai.",
      externalUrl: `https://github.com/${repo}/actions/workflows/${workflow}`,
    };
  }

  const body = await res.text();
  return {
    started: false,
    mode: "github_actions",
    message: `GitHub menolak permintaan (HTTP ${res.status}). ${body.slice(0, 200)}`,
  };
}
