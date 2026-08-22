import { prisma } from "./db";
import { computeScore } from "./scoring/orchestrator";
import { MODE_LIST } from "./modes";
import { getActiveMode } from "./settings";
import { invalidateUniverseCache, loadUniverseSnapshot } from "./universeSnapshot";
import { aiEnabled } from "./ai/client";
import { explainChange } from "./ai/educationAgent";
import type { InvestmentMode } from "./types";
import type { ScoringContext } from "./scoring/orchestrator";

/** Bentuk berita yang dibutuhkan sentimentScore(). */
type ScoringNews = ScoringContext["news"][number];

/**
 * Logika job yang tidak menyentuh jaringan eksternal, ditaruh di lib supaya
 * bisa dipanggil dari DUA tempat tanpa duplikasi:
 *   1. CLI (`npm run job:score`) lewat src/jobs/*.ts
 *   2. HTTP (Vercel Cron) lewat /api/cron/[job]
 *
 * Job yang memanggil provider eksternal (refreshMarketData, refreshFundamentals,
 * refreshNews) sengaja TIDAK ditaruh di sini — durasinya beberapa menit dan
 * tidak cocok untuk fungsi serverless.
 */

export interface JobOutcome {
  ok: number;
  failed: number;
  message: string;
}

/**
 * Mengulang operasi database yang gagal karena gangguan koneksi sesaat.
 *
 * Perlu karena Postgres terkelola (Neon, Supabase) mematikan compute saat idle
 * dan membatasi jumlah koneksi di tier gratis. Job yang berjalan belasan menit
 * hampir pasti menemui satu-dua putus koneksi; tanpa percobaan ulang, aset yang
 * kebetulan diproses saat itu kehilangan skornya sampai job berikutnya.
 *
 * Hanya kesalahan konektivitas yang diulang. Kesalahan logika atau constraint
 * dilempar apa adanya supaya tidak tersembunyi di balik percobaan ulang.
 */
const TRANSIENT_PATTERNS = [
  "can't reach database server",
  "connection pool",
  "timed out fetching",
  "connection closed",
  "server has closed the connection",
  "econnreset",
];

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = (err as Error).message?.toLowerCase() ?? "";
      const transient = TRANSIENT_PATTERNS.some((p) => message.includes(p));
      if (!transient || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }

  throw lastError;
}

/** Pesan error Prisma bisa puluhan baris; hanya baris pertama yang informatif. */
function firstLine(err: unknown): string {
  return String((err as Error)?.message ?? err).split(/\r?\n/)[0];
}

const SCORE_DELTA_THRESHOLD = 5;
const PRICE_DELTA_THRESHOLD = 5;

export async function runRescore(options: { allModes?: boolean } = {}): Promise<JobOutcome> {
  // Default menghitung SELURUH mode, bukan hanya yang sedang aktif.
  //
  // Sebelumnya hanya mode aktif yang dihitung. Akibatnya begitu pengguna
  // mengganti Investment Mode lewat menu, seluruh aplikasi tampak kosong —
  // skor, top movers, dan screener semuanya n/a — sampai job dijalankan ulang.
  // Perhitungannya sendiri murni CPU dan berbagi pembacaan data yang sama,
  // jadi menghitung keempatnya sekaligus praktis tidak menambah biaya baca.
  const modes: InvestmentMode[] =
    options.allModes === false ? [await getActiveMode()] : MODE_LIST.map((m) => m.id);

  // Satu pemuatan massal untuk seluruh universe. Versi sebelumnya memanggil
  // buildScoringContext() per aset (4 query masing-masing), yang di Postgres
  // terkelola membuat job ini berjalan belasan menit dan rawan putus koneksi
  // di tengah jalan.
  const universe = await withRetry(() => loadUniverseSnapshot({ force: true }));

  // Berita untuk dimensi sentimen — satu query untuk seluruh universe, dibatasi
  // ke 14 hari terakhir karena hanya rentang itu yang dipakai sentimentScore().
  const newsRows = await withRetry(() =>
    prisma.news.findMany({
      where: { publishedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
      orderBy: { publishedAt: "desc" },
      select: {
        assetId: true,
        title: true,
        sentiment: true,
        publishedAt: true,
        sourceType: true,
      },
    }),
  );

  const newsByAsset = new Map<string, ScoringNews[]>();
  for (const row of newsRows) {
    const list = newsByAsset.get(row.assetId) ?? [];
    list.push({
      title: row.title,
      sentiment: row.sentiment,
      publishedAt: row.publishedAt,
      sourceType: row.sourceType,
    });
    newsByAsset.set(row.assetId, list);
  }

  let ok = 0;
  let failed = 0;
  let skipped = 0;
  const failures: string[] = [];
  const pending: {
    assetId: string;
    investmentMode: string;
    fundamentalScore: number | null;
    technicalScore: number | null;
    valuationScore: number | null;
    sentimentScore: number | null;
    riskScore: number | null;
    overallScore: number;
    confidence: number;
    breakdownJson: string;
  }[] = [];

  for (const row of universe.rows) {
    try {
      const ctx: ScoringContext = {
        ticker: row.asset.ticker,
        assetType: row.asset.assetType,
        technical: row.technical,
        fundamentals: row.fundamentals,
        news: newsByAsset.get(row.asset.id) ?? [],
        priceAgeHours: row.priceAgeHours,
      };

      for (const mode of modes) {
        const result = computeScore(ctx, mode);

        // Aset tanpa satu pun dimensi berdata tidak disimpan. Menyimpan skor 0
        // akan membuatnya muncul sebagai "aset terburuk" di screener, padahal
        // yang sebenarnya terjadi adalah datanya belum ada.
        if (result.confidence === 0) {
          skipped++;
          continue;
        }

        pending.push({
          assetId: row.asset.id,
          investmentMode: mode,
          fundamentalScore: result.breakdown.fundamental.score,
          technicalScore: result.breakdown.technical.score,
          valuationScore: result.breakdown.valuation.score,
          sentimentScore: result.breakdown.sentiment.score,
          riskScore: result.breakdown.risk.score,
          overallScore: result.overallScore,
          confidence: result.confidence,
          breakdownJson: JSON.stringify({
            breakdown: result.breakdown,
            effectiveWeights: result.effectiveWeights,
            warnings: result.warnings,
          }),
        });
        ok++;
      }
    } catch (err) {
      failed++;
      failures.push(`${row.asset.ticker}: ${firstLine(err)}`);
    }
  }

  // Tulis massal: satu perjalanan jaringan per 200 baris, bukan per skor.
  for (let i = 0; i < pending.length; i += 200) {
    const chunk = pending.slice(i, i + 200);
    try {
      await withRetry(() => prisma.analysisScore.createMany({ data: chunk }));
    } catch (err) {
      failed += chunk.length;
      ok -= chunk.length;
      failures.push(`batch ${i}: ${firstLine(err)}`);
    }
  }

  // Pangkas riwayat: 30 skor terakhir per aset+mode sudah cukup untuk mendeteksi
  // perubahan, dan mencegah tabel tumbuh tanpa batas.
  const stale = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM analysis_scores
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY asset_id, investment_mode ORDER BY created_at DESC
        ) AS rn FROM analysis_scores
      ) ranked WHERE rn <= 30
    )
  `;
  if (stale.length > 0) {
    for (let i = 0; i < stale.length; i += 500) {
      await prisma.analysisScore.deleteMany({
        where: { id: { in: stale.slice(i, i + 500).map((s) => s.id) } },
      });
    }
  }

  invalidateUniverseCache();

  const base = `${ok} skor tersimpan untuk ${modes.length} mode (${modes.join(", ")}), ${skipped} dilewati karena tidak ada data sama sekali, ${stale.length} skor lama dipangkas.`;

  return {
    ok,
    failed,
    // Kegagalan disebut satu per satu, bukan sekadar dihitung — kalau sebuah aset
    // kehilangan skornya, penyebabnya harus bisa dilacak tanpa menjalankan ulang.
    message:
      failures.length > 0
        ? `${base} GAGAL (${failures.length}): ${failures.slice(0, 10).join(" | ")}${failures.length > 10 ? " ..." : ""}`
        : base,
  };
}

interface DetectedEvent {
  assetId: string;
  alertId?: string;
  eventType: string;
  title: string;
  detail: string;
  severity: string;
  previous: Record<string, unknown>;
  current: Record<string, unknown>;
}

export async function runWatchlistDetection(): Promise<JobOutcome> {
  const mode = await getActiveMode();
  const watchlist = await prisma.watchlistItem.findMany({ include: { asset: true } });

  if (watchlist.length === 0) {
    return { ok: 0, failed: 0, message: "Watchlist kosong — tidak ada yang dipantau." };
  }

  const events: DetectedEvent[] = [];

  for (const item of watchlist) {
    const asset = item.asset;

    const scores = await prisma.analysisScore.findMany({
      where: { assetId: asset.id, investmentMode: mode },
      orderBy: { createdAt: "desc" },
      take: 2,
    });

    if (scores.length === 2) {
      const [now, before] = scores;
      const delta = now.overallScore - before.overallScore;

      if (Math.abs(delta) >= SCORE_DELTA_THRESHOLD) {
        events.push({
          assetId: asset.id,
          eventType: "score_change",
          title: `Skor ${asset.ticker} ${delta > 0 ? "naik" : "turun"} ${Math.abs(delta).toFixed(1)} poin`,
          detail: `${before.overallScore.toFixed(1)} → ${now.overallScore.toFixed(1)} (mode ${mode}, confidence ${(now.confidence * 100).toFixed(0)}%)`,
          severity: Math.abs(delta) >= 12 ? "warning" : "info",
          previous: {
            overall: before.overallScore,
            fundamental: before.fundamentalScore,
            technical: before.technicalScore,
            valuation: before.valuationScore,
            sentimen: before.sentimentScore,
            risiko: before.riskScore,
            waktu: before.createdAt.toISOString(),
          },
          current: {
            overall: now.overallScore,
            fundamental: now.fundamentalScore,
            technical: now.technicalScore,
            valuation: now.valuationScore,
            sentimen: now.sentimentScore,
            risiko: now.riskScore,
            waktu: now.createdAt.toISOString(),
          },
        });
      }
    }

    const bars = await prisma.marketData.findMany({
      where: { assetId: asset.id },
      orderBy: { timestamp: "desc" },
      take: 2,
    });

    if (bars.length === 2 && bars[0].close && bars[1].close) {
      const changePct = (bars[0].close / bars[1].close - 1) * 100;
      if (Math.abs(changePct) >= PRICE_DELTA_THRESHOLD) {
        events.push({
          assetId: asset.id,
          eventType: "price",
          title: `${asset.ticker} bergerak ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}% dalam sehari`,
          detail: `${bars[1].close} → ${bars[0].close} ${asset.currency} (sumber ${bars[0].source}, ${bars[0].freshness})`,
          severity: Math.abs(changePct) >= 10 ? "warning" : "info",
          previous: { close: bars[1].close, waktu: bars[1].timestamp.toISOString() },
          current: { close: bars[0].close, waktu: bars[0].timestamp.toISOString() },
        });
      }
    }

    const officialNews = await prisma.news.findMany({
      where: {
        assetId: asset.id,
        sourceType: "official",
        fetchedAt: { gte: new Date(Date.now() - 24 * 3_600_000) },
      },
      orderBy: { publishedAt: "desc" },
      take: 3,
    });

    for (const news of officialNews) {
      events.push({
        assetId: asset.id,
        eventType: "news",
        title: `Berita resmi: ${asset.ticker}`,
        detail: `"${news.title}" — ${news.source} (sentimen rule-based: ${news.sentiment ?? "netral"})`,
        severity: news.sentiment === "negative" ? "warning" : "info",
        previous: {},
        current: { judul: news.title, sumber: news.source },
      });
    }
  }

  // Alert buatan pengguna.
  const alerts = await prisma.alert.findMany({ where: { active: true }, include: { asset: true } });

  for (const alert of alerts) {
    if (alert.alertType !== "price") continue;

    const condition = JSON.parse(alert.conditionJson) as { operator: "gt" | "lt"; value: number };
    const latest = await prisma.marketData.findFirst({
      where: { assetId: alert.assetId },
      orderBy: { timestamp: "desc" },
    });
    if (!latest?.close) continue;

    const triggered =
      condition.operator === "gt" ? latest.close > condition.value : latest.close < condition.value;
    const recentlyFired =
      alert.lastTriggeredAt && Date.now() - alert.lastTriggeredAt.getTime() < 24 * 3_600_000;

    if (triggered && !recentlyFired) {
      events.push({
        assetId: alert.assetId,
        alertId: alert.id,
        eventType: "alert",
        title: `Alert: ${alert.asset.ticker} ${condition.operator === "gt" ? "di atas" : "di bawah"} ${condition.value}`,
        detail: `Harga terakhir ${latest.close} ${alert.asset.currency} pada ${latest.timestamp.toISOString().slice(0, 10)}`,
        severity: "critical",
        previous: { ambang: condition.value },
        current: { close: latest.close },
      });
      await prisma.alert.update({
        where: { id: alert.id },
        data: { lastTriggeredAt: new Date() },
      });
    }
  }

  let ok = 0;
  let explained = 0;

  for (const event of events) {
    let explanation: string | null = null;

    // Penjelasan AI hanya untuk kejadian yang butuh sebab-akibat. Alert harga
    // biasa tidak perlu dijelaskan — kondisinya sudah eksplisit di judul.
    if (aiEnabled() && (event.eventType === "score_change" || event.eventType === "price")) {
      try {
        const asset = await prisma.asset.findUnique({ where: { id: event.assetId } });
        const recentNews = await prisma.news.findMany({
          where: {
            assetId: event.assetId,
            publishedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
          },
          orderBy: { publishedAt: "desc" },
          take: 5,
          select: { title: true, source: true, publishedAt: true },
        });

        explanation = await explainChange({
          ticker: asset!.ticker,
          name: asset!.name,
          previous: event.previous,
          current: event.current,
          recentNews,
        });
        explained++;
      } catch {
        // Kegagalan LLM tidak boleh menghilangkan alertnya — kejadian tetap
        // tercatat, hanya tanpa penjelasan.
      }
    }

    await prisma.alertEvent.create({
      data: {
        assetId: event.assetId,
        alertId: event.alertId,
        eventType: event.eventType,
        title: event.title,
        detail: event.detail,
        severity: event.severity,
        explanation,
      },
    });
    ok++;
  }

  return {
    ok,
    failed: 0,
    message:
      events.length === 0
        ? `Tidak ada perubahan signifikan pada ${watchlist.length} aset di watchlist.`
        : `${ok} kejadian tercatat, ${explained} di antaranya dijelaskan oleh AI.${aiEnabled() ? "" : " (ANTHROPIC_API_KEY/GEMINI_API_KEY kosong — penjelasan AI dilewati.)"}`,
  };
}
