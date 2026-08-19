/**
 * Jalur kedua untuk memperbarui data: memicu workflow GitHub Actions.
 *
 * Bedanya dengan refresh berpotongan di lib/refreshChunked.ts — yang loop-nya
 * berjalan di browser sehingga halaman harus tetap terbuka — jalur ini
 * menyerahkan seluruh pekerjaan ke runner GitHub. Halaman boleh langsung
 * ditutup, dan penarikan datanya berjalan sampai selesai tanpa penunggu.
 *
 * Opsional: kalau GITHUB_DISPATCH_TOKEN tidak diisi, tombolnya tidak muncul
 * dan refresh berpotongan tetap tersedia penuh.
 */

export interface DispatchConfig {
  available: boolean;
  repository: string | null;
  workflow: string;
  actionsUrl: string | null;
}

export function dispatchConfig(): DispatchConfig {
  const repository = process.env.GITHUB_REPOSITORY ?? null;
  const workflow = process.env.GITHUB_WORKFLOW_FILE || "refresh-data.yml";
  const available = Boolean(process.env.GITHUB_DISPATCH_TOKEN && repository);

  return {
    available,
    repository,
    workflow,
    actionsUrl: repository ? `https://github.com/${repository}/actions/workflows/${workflow}` : null,
  };
}

export interface DispatchResult {
  ok: boolean;
  message: string;
  url: string | null;
}

export async function dispatchWorkflow(): Promise<DispatchResult> {
  const config = dispatchConfig();

  if (!config.available) {
    return {
      ok: false,
      url: null,
      message:
        "GITHUB_DISPATCH_TOKEN atau GITHUB_REPOSITORY belum diisi, jadi workflow tidak bisa dipicu dari sini.",
    };
  }

  const ref = process.env.GITHUB_REF_NAME || "main";

  let res: Response;
  try {
    res = await fetch(
      `https://api.github.com/repos/${config.repository}/actions/workflows/${config.workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref, inputs: { seed: "false" } }),
      },
    );
  } catch (err) {
    return { ok: false, url: null, message: `Gagal menghubungi GitHub: ${(err as Error).message}` };
  }

  if (res.status === 204) {
    return {
      ok: true,
      url: config.actionsUrl,
      message:
        "Workflow dijalankan di GitHub Actions. Halaman ini boleh ditutup — data akan masuk ke database dalam 15-25 menit.",
    };
  }

  // Pesan error GitHub dikembalikan apa adanya karena penyebabnya spesifik dan
  // perlu terlihat: token kedaluwarsa, scope kurang, nama repo salah, atau
  // workflow belum ada di branch yang dituju.
  const body = await res.text().catch(() => "");
  const hint =
    res.status === 401 || res.status === 403
      ? " Periksa GITHUB_DISPATCH_TOKEN — token mungkin kedaluwarsa atau tidak punya scope `workflow`."
      : res.status === 404
        ? ` Periksa GITHUB_REPOSITORY (sekarang "${config.repository}") dan pastikan berkas ${config.workflow} sudah ada di branch ${ref}.`
        : "";

  return {
    ok: false,
    url: config.actionsUrl,
    message: `GitHub menolak permintaan (HTTP ${res.status}).${hint} ${body.slice(0, 200)}`.trim(),
  };
}
