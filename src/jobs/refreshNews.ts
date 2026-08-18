import { prisma } from "../lib/db";
import { fetchCompanyNews, finnhubEnabled, FINNHUB_SOURCE } from "../lib/providers/finnhub";
import { fetchNewsForSymbols, marketauxEnabled } from "../lib/providers/marketaux";
import { classifySentiment } from "../lib/scoring/sentiment";
import { finish, progress, runJob } from "./_runner";
import type { NewsItem } from "../lib/providers/finnhub";

/**
 * Pengisi tabel berita.
 *
 * Strategi kuota (PRD §4): Finnhub limitnya longgar (60/menit) jadi dipakai untuk
 * seluruh saham AS. Marketaux hanya 100 request/HARI, jadi sengaja dibatasi ke
 * aset yang ada di watchlist — di situlah berita paling berguna.
 *
 * Sentimen diisi di sini dengan classifier rule-based, sehingga scorer tinggal
 * membaca kolomnya tanpa memproses ulang tiap kali halaman dibuka.
 */

async function saveNews(assetId: string, items: NewsItem[], source: string): Promise<number> {
  const fetchedAt = new Date();
  let saved = 0;

  for (const item of items) {
    if (!item.url) continue;
    try {
      await prisma.news.upsert({
        where: { assetId_url: { assetId, url: item.url } },
        create: {
          assetId,
          title: item.title,
          source: item.source,
          sourceType: item.sourceType,
          url: item.url,
          summary: item.summary,
          sentiment: classifySentiment(item.title, item.summary),
          publishedAt: item.publishedAt,
          fetchedAt,
        },
        update: { fetchedAt },
      });
      saved++;
    } catch {
      // Duplikat atau URL bermasalah — lewati satu item, jangan gagalkan job.
    }
  }
  return saved;
}

async function refresh() {
  if (!finnhubEnabled() && !marketauxEnabled()) {
    return {
      ok: 0,
      failed: 0,
      message:
        "FINNHUB_API_KEY dan MARKETAUX_API_KEY sama-sama kosong — tidak ada sumber berita. Dimensi sentimen akan tetap kosong di semua aset.",
    };
  }

  let ok = 0;
  let failed = 0;
  let totalItems = 0;

  // ── Finnhub: seluruh saham AS ────────────────────────────────────────────
  if (finnhubEnabled()) {
    const usAssets = await prisma.asset.findMany({
      where: { assetType: "us_stock" },
      orderBy: { ticker: "asc" },
    });

    console.log(`   Finnhub: berita untuk ${usAssets.length} saham AS`);
    let i = 0;
    for (const asset of usAssets) {
      i++;
      const items = await fetchCompanyNews(asset.providerSymbol ?? asset.ticker, 7);
      if (items.length === 0) {
        failed++;
      } else {
        totalItems += await saveNews(asset.id, items, FINNHUB_SOURCE);
        ok++;
      }
      progress(i, usAssets.length, "Finnhub news");
    }
  }

  // ── Marketaux: hanya watchlist, karena kuotanya 100/hari ─────────────────
  if (marketauxEnabled()) {
    const watchlist = await prisma.watchlistItem.findMany({ include: { asset: true } });
    const nonUs = watchlist.filter((w) => w.asset.assetType !== "us_stock");

    if (nonUs.length > 0) {
      console.log(`   Marketaux: ${nonUs.length} aset watchlist non-AS`);
      for (const item of nonUs) {
        // Marketaux memakai simbol tanpa suffix .JK untuk sebagian emiten.
        const symbol = item.asset.ticker.replace("-USD", "");
        const items = await fetchNewsForSymbols([symbol]);
        if (items.length > 0) {
          totalItems += await saveNews(item.assetId, items, "marketaux");
          ok++;
        }
      }
    }
  }

  // Berita lebih tua dari 90 hari tidak dipakai scorer mana pun — dibuang supaya
  // database tidak tumbuh tanpa batas.
  const cutoff = new Date(Date.now() - 90 * 86_400_000);
  const { count: pruned } = await prisma.news.deleteMany({
    where: { publishedAt: { lt: cutoff } },
  });

  return {
    ok,
    failed,
    message: `${totalItems} artikel tersimpan/diperbarui. ${pruned} artikel lama (>90 hari) dihapus.`,
  };
}

runJob("refreshNews", refresh).finally(finish);
