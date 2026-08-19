import { prisma } from "./db";
import {
  saveBars,
  saveNews,
  type AssetScope,
} from "./refreshJobs";
import { fetchChart, YAHOO_FRESHNESS, YAHOO_SOURCE } from "./providers/yahoo";
import {
  COINGECKO_FRESHNESS,
  COINGECKO_SOURCE,
  fetchCoinHistory,
  fetchTopCoins,
} from "./providers/coingecko";
import { fetchCompanyNews, fetchMetrics, finnhubEnabled, FINNHUB_SOURCE } from "./providers/finnhub";
import { fetchIdxNews } from "./providers/googleNewsId";
import { runRescore } from "./jobRunners";
import { invalidateUniverseCache } from "./universeSnapshot";

/**
 * Refresh data yang dipecah menjadi potongan-potongan pendek.
 *
 * Kendala yang dipecahkan di sini: menarik ~270 aset butuh 15-25 menit karena
 * limiter provider gratis, sedangkan satu request ke fungsi serverless Vercel
 * tidak boleh lebih dari beberapa puluh detik. Menjalankannya sebagai satu
 * proses panjang mustahil di sana — dan pekerjaan latar apa pun ikut mati
 * begitu response dikirim.
 *
 * Solusinya: tiap request mengerjakan sebanyak mungkin dalam anggaran waktu
 * yang aman, menyimpan posisinya, lalu berhenti. Browser memanggil lagi untuk
 * melanjutkan. Tidak butuh token, tidak butuh layanan luar, dan berjalan sama
 * persis di Vercel maupun di server lokal.
 *
 * Posisinya disimpan di DATABASE, bukan di memori proses, karena tiap request
 * di Vercel bisa mendarat di instance yang berbeda.
 */

/**
 * Anggaran per request. Dibuat jauh di bawah batas 60 detik supaya satu operasi
 * yang kebetulan lambat tidak membuat seluruh request terpotong di tengah
 * penulisan.
 */
const BUDGET_MS = 20_000;

const STATE_KEY = "refresh_state";

export type Phase = "market" | "fundamentals" | "news" | "score" | "done";

export interface PhaseProgress {
  done: number;
  total: number;
  label: string;
}

export interface RefreshState {
  status: "idle" | "running" | "done" | "error";
  phase: Phase;
  cursor: number;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  only: AssetScope[] | null;
  progress: PhaseProgress | null;
  /** ringkasan per fase yang sudah selesai */
  log: { phase: Phase; message: string }[];
  error: string | null;
  totals: { ok: number; failed: number };
  /**
   * Penghitung untuk FASE yang sedang berjalan, di-reset saat berganti fase.
   *
   * Harus ikut disimpan, bukan variabel lokal: tiap potongan adalah invokasi
   * fungsi yang berbeda, jadi variabel lokal selalu mulai dari nol dan angka
   * yang dilaporkan di akhir fase hanya mencerminkan potongan terakhir.
   */
  phaseCount: number;
}

const IDLE: RefreshState = {
  status: "idle",
  phase: "market",
  cursor: 0,
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
  only: null,
  progress: null,
  log: [],
  error: null,
  totals: { ok: 0, failed: 0 },
  phaseCount: 0,
};

export async function readState(): Promise<RefreshState> {
  const row = await prisma.appSetting.findUnique({ where: { key: STATE_KEY } });
  if (!row) return IDLE;
  try {
    return { ...IDLE, ...(JSON.parse(row.value) as RefreshState) };
  } catch {
    return IDLE;
  }
}

async function writeState(state: RefreshState): Promise<RefreshState> {
  const value = JSON.stringify({ ...state, updatedAt: new Date().toISOString() });
  await prisma.appSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value },
    update: { value },
  });
  return JSON.parse(value) as RefreshState;
}

/**
 * Sebuah refresh dianggap terbengkalai kalau tidak ada kemajuan selama ini —
 * misalnya karena tab ditutup di tengah jalan. Tanpa ini, satu refresh yang
 * ditinggalkan akan memblokir tombol selamanya.
 */
const STALL_MS = 5 * 60_000;

export function isStalled(state: RefreshState): boolean {
  if (state.status !== "running" || !state.updatedAt) return false;
  return Date.now() - new Date(state.updatedAt).getTime() > STALL_MS;
}

export async function startRefresh(only?: AssetScope[]): Promise<RefreshState> {
  const current = await readState();
  if (current.status === "running" && !isStalled(current)) return current;

  return writeState({
    ...IDLE,
    status: "running",
    phase: "market",
    cursor: 0,
    only: only?.length ? only : null,
    startedAt: new Date().toISOString(),
    progress: { done: 0, total: 0, label: "Menyiapkan..." },
  });
}

export async function resetRefresh(): Promise<RefreshState> {
  return writeState({ ...IDLE });
}

// ── Daftar pekerjaan fase harga ───────────────────────────────────────────
// Disusun sebagai satu daftar berindeks supaya kursor cukup berupa satu angka.

type MarketTask =
  | { kind: "yahoo"; assetId: string; ticker: string; symbol: string }
  | { kind: "crypto_quotes" }
  | { kind: "crypto_history"; assetId: string; ticker: string; symbol: string };

const TYPE_BY_SCOPE: Record<AssetScope, string> = {
  us: "us_stock",
  idx: "idx_stock",
  crypto: "crypto",
  gold: "gold",
};

async function buildMarketTasks(only: AssetScope[] | null): Promise<MarketTask[]> {
  const wanted = (assetType: string) =>
    !only?.length || only.some((s) => TYPE_BY_SCOPE[s] === assetType);

  const tasks: MarketTask[] = [];

  const yahooAssets = (
    await prisma.asset.findMany({
      where: { assetType: { in: ["us_stock", "idx_stock", "gold"] } },
      orderBy: { ticker: "asc" },
    })
  ).filter((a) => wanted(a.assetType));

  for (const a of yahooAssets) {
    tasks.push({
      kind: "yahoo",
      assetId: a.id,
      ticker: a.ticker,
      symbol: a.providerSymbol ?? a.ticker,
    });
  }

  if (wanted("crypto")) {
    const cryptoAssets = await prisma.asset.findMany({
      where: { assetType: "crypto" },
      orderBy: { ticker: "asc" },
    });

    if (cryptoAssets.length > 0) {
      // Harga terkini seluruh coin diambil dalam satu panggilan.
      tasks.push({ kind: "crypto_quotes" });

      for (const a of cryptoAssets) {
        tasks.push({
          kind: "crypto_history",
          assetId: a.id,
          ticker: a.ticker,
          symbol: a.providerSymbol ?? "",
        });
      }
    }
  }

  return tasks;
}

async function runMarketSlice(state: RefreshState, deadline: number): Promise<RefreshState> {
  const tasks = await buildMarketTasks(state.only);
  let cursor = state.cursor;
  let ok = state.totals.ok;
  let failed = state.totals.failed;
  let label = "";

  while (cursor < tasks.length && Date.now() < deadline) {
    const task = tasks[cursor];

    if (task.kind === "yahoo") {
      label = `Harga ${task.ticker}`;
      const chart = await fetchChart(task.symbol, "1y");
      if (!chart || chart.bars.length === 0) {
        // Kegagalan provider tidak menghapus data lama dan tidak menulis angka
        // pengganti — umurnya yang nanti membuat UI menandainya basi.
        failed++;
      } else {
        await saveBars(task.assetId, chart.bars, YAHOO_SOURCE, YAHOO_FRESHNESS);
        ok++;
      }
    } else if (task.kind === "crypto_quotes") {
      label = "Harga kripto terkini";
      const assets = await prisma.asset.findMany({ where: { assetType: "crypto" } });
      const markets = await fetchTopCoins(Math.max(assets.length, 100));
      const byId = new Map(markets.map((m) => [m.id, m]));
      const fetchedAt = new Date();
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      for (const asset of assets) {
        const market = byId.get(asset.providerSymbol ?? "");
        if (!market?.currentPrice) {
          failed++;
          continue;
        }
        const row = {
          price: market.currentPrice,
          high: market.high24h,
          low: market.low24h,
          close: market.currentPrice,
          volume: market.totalVolume,
          source: COINGECKO_SOURCE,
          freshness: COINGECKO_FRESHNESS,
          fetchedAt,
        };
        await prisma.marketData.upsert({
          where: { assetId_timestamp: { assetId: asset.id, timestamp: today } },
          create: { assetId: asset.id, timestamp: today, open: null, ...row },
          update: row,
        });
        ok++;
      }
    } else {
      label = `Riwayat ${task.ticker}`;
      // Riwayat kripto boros kuota (satu panggilan per coin), jadi hanya diambil
      // untuk coin yang barnya belum cukup untuk indikator.
      const barCount = await prisma.marketData.count({ where: { assetId: task.assetId } });
      if (barCount < 200 && task.symbol) {
        const history = await fetchCoinHistory(task.symbol, 365);
        if (history.length > 0) {
          await saveBars(task.assetId, history, COINGECKO_SOURCE, COINGECKO_FRESHNESS);
        }
      }
    }

    cursor++;
  }

  const finishedPhase = cursor >= tasks.length;
  invalidateUniverseCache();

  return writeState({
    ...state,
    phase: finishedPhase ? "fundamentals" : "market",
    cursor: finishedPhase ? 0 : cursor,
    phaseCount: 0,
    totals: { ok, failed },
    progress: { done: cursor, total: tasks.length, label },
    log: finishedPhase
      ? [...state.log, { phase: "market", message: `${ok} aset diperbarui, ${failed} gagal.` }]
      : state.log,
  });
}

async function runFundamentalsSlice(state: RefreshState, deadline: number): Promise<RefreshState> {
  if (!finnhubEnabled()) {
    return writeState({
      ...state,
      phase: "news",
      cursor: 0,
      phaseCount: 0,
      progress: null,
      log: [
        ...state.log,
        {
          phase: "fundamentals",
          message:
            "Dilewati — FINNHUB_API_KEY belum diisi, jadi tidak ada sumber fundamental. Skor fundamental & valuasi tetap kosong.",
        },
      ],
    });
  }

  const assets = await prisma.asset.findMany({
    where: { assetType: "us_stock" },
    orderBy: { ticker: "asc" },
  });

  let cursor = state.cursor;
  let processed = state.phaseCount;
  const period = `TTM-${new Date().toISOString().slice(0, 7)}`;
  const now = new Date();
  let label = "";

  while (cursor < assets.length && Date.now() < deadline) {
    const asset = assets[cursor];
    label = `Fundamental ${asset.ticker}`;
    const metrics = await fetchMetrics(asset.providerSymbol ?? asset.ticker);

    for (const m of metrics) {
      await prisma.fundamentalData.upsert({
        where: { assetId_metric_period: { assetId: asset.id, metric: m.metric, period } },
        create: {
          assetId: asset.id,
          metric: m.metric,
          value: m.value,
          period,
          source: FINNHUB_SOURCE,
          reportedAt: now,
          fetchedAt: now,
        },
        update: { value: m.value, fetchedAt: now },
      });
    }

    if (metrics.length > 0) processed++;
    cursor++;
  }

  const finishedPhase = cursor >= assets.length;
  invalidateUniverseCache();

  return writeState({
    ...state,
    phase: finishedPhase ? "news" : "fundamentals",
    cursor: finishedPhase ? 0 : cursor,
    phaseCount: finishedPhase ? 0 : processed,
    progress: { done: cursor, total: assets.length, label },
    log: finishedPhase
      ? [
          ...state.log,
          {
            phase: "fundamentals",
            message: `${processed} dari ${assets.length} saham AS punya fundamental terbaru.`,
          },
        ]
      : state.log,
  });
}

async function runNewsSlice(state: RefreshState, deadline: number): Promise<RefreshState> {
  // Dua sumber berbeda digabung jadi SATU daftar tugas berindeks, supaya
  // kursornya tetap satu angka dan bisa dilanjutkan lintas potongan:
  //   - saham AS lewat Finnhub (butuh key; dilewati kalau kosong)
  //   - emiten IDX lewat Google News RSS (tanpa key, tanpa kuota)
  const usAssets = finnhubEnabled()
    ? await prisma.asset.findMany({ where: { assetType: "us_stock" }, orderBy: { ticker: "asc" } })
    : [];
  const idxAssets = await prisma.asset.findMany({
    where: { assetType: "idx_stock" },
    orderBy: { ticker: "asc" },
  });

  const tasks = [
    ...usAssets.map((a) => ({ kind: "us" as const, asset: a })),
    ...idxAssets.map((a) => ({ kind: "idx" as const, asset: a })),
  ];

  if (tasks.length === 0) {
    return writeState({
      ...state,
      phase: "score",
      cursor: 0,
      phaseCount: 0,
      progress: null,
      log: [
        ...state.log,
        {
          phase: "news",
          message:
            "Dilewati — tidak ada aset yang punya sumber berita. Saham AS butuh FINNHUB_API_KEY; emiten IDX tidak butuh key tapi universe-nya kosong.",
        },
      ],
    });
  }

  let cursor = state.cursor;
  let items = state.phaseCount;
  let label = "";

  while (cursor < tasks.length && Date.now() < deadline) {
    const task = tasks[cursor];
    label = `Berita ${task.asset.ticker}`;

    const news =
      task.kind === "us"
        ? await fetchCompanyNews(task.asset.providerSymbol ?? task.asset.ticker, 7)
        : await fetchIdxNews(task.asset.ticker);

    if (news.length > 0) items += await saveNews(task.asset.id, news);
    cursor++;
  }

  const finishedPhase = cursor >= tasks.length;

  if (finishedPhase) {
    await prisma.news.deleteMany({
      where: { publishedAt: { lt: new Date(Date.now() - 90 * 86_400_000) } },
    });
  }

  invalidateUniverseCache();

  return writeState({
    ...state,
    phase: finishedPhase ? "score" : "news",
    cursor: finishedPhase ? 0 : cursor,
    phaseCount: finishedPhase ? 0 : items,
    progress: { done: cursor, total: tasks.length, label },
    log: finishedPhase
      ? [
          ...state.log,
          {
            phase: "news",
            message: `${items} artikel tersimpan/diperbarui dari ${usAssets.length} saham AS dan ${idxAssets.length} emiten IDX.`,
          },
        ]
      : state.log,
  });
}

async function runScorePhase(state: RefreshState): Promise<RefreshState> {
  // Scoring murni CPU dan sudah dibuat massal — 268 aset x 4 mode selesai
  // dalam belasan detik, jadi muat dalam satu potongan.
  const result = await runRescore();
  invalidateUniverseCache();

  return writeState({
    ...state,
    status: "done",
    phase: "done",
    cursor: 0,
    progress: null,
    finishedAt: new Date().toISOString(),
    log: [...state.log, { phase: "score", message: result.message }],
  });
}

/**
 * Mengerjakan satu potongan lalu berhenti. Pemanggil (browser) memanggil lagi
 * selama status masih `running`.
 */
export async function advanceRefresh(): Promise<RefreshState> {
  const state = await readState();

  if (state.status !== "running") return state;

  const deadline = Date.now() + BUDGET_MS;

  try {
    switch (state.phase) {
      case "market":
        return await runMarketSlice(state, deadline);
      case "fundamentals":
        return await runFundamentalsSlice(state, deadline);
      case "news":
        return await runNewsSlice(state, deadline);
      case "score":
        return await runScorePhase(state);
      default:
        return await writeState({ ...state, status: "done", finishedAt: new Date().toISOString() });
    }
  } catch (err) {
    return writeState({
      ...state,
      status: "error",
      error: (err as Error).message,
      finishedAt: new Date().toISOString(),
    });
  }
}
