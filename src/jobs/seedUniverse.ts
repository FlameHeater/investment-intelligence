import { prisma } from "../lib/db";
import { fetchTopCoins } from "../lib/providers/coingecko";
import { CRYPTO_TOP_N, STATIC_UNIVERSE, type UniverseEntry } from "../lib/universe";
import { finish, runJob } from "./_runner";

/**
 * Mengisi tabel assets dengan universe MVP (PRD §4 & §7).
 * Idempoten — aman dijalankan berkali-kali.
 *
 * Kripto diambil dari CoinGecko top-100 by market cap, bukan didaftar manual,
 * karena komposisi 100 besar berubah dari waktu ke waktu.
 */
async function seed() {
  let ok = 0;
  let failed = 0;

  const entries: UniverseEntry[] = [...STATIC_UNIVERSE];

  console.log(`   Mengambil ${CRYPTO_TOP_N} kripto teratas dari CoinGecko...`);
  const coins = await fetchTopCoins(CRYPTO_TOP_N);

  if (coins.length === 0) {
    console.warn(
      "   ! CoinGecko tidak mengembalikan data (rate limit atau jaringan). Universe kripto dilewati — jalankan ulang nanti.",
    );
  }

  for (const coin of coins) {
    entries.push({
      // Prefiks menghindari tabrakan dengan ticker saham (mis. COIN vs Coinbase).
      ticker: `${coin.symbol}-USD`,
      name: coin.name,
      assetType: "crypto",
      exchange: "CoinGecko",
      currency: "USD",
      providerSymbol: coin.id,
      sector: "Kripto",
    });
  }

  for (const entry of entries) {
    try {
      await prisma.asset.upsert({
        where: { ticker: entry.ticker },
        create: {
          ticker: entry.ticker,
          name: entry.name,
          assetType: entry.assetType,
          exchange: entry.exchange,
          currency: entry.currency,
          providerSymbol: entry.providerSymbol,
          sector: entry.sector,
        },
        update: {
          name: entry.name,
          providerSymbol: entry.providerSymbol,
          sector: entry.sector,
        },
      });
      ok++;
    } catch (err) {
      failed++;
      console.error(`   ! Gagal menyimpan ${entry.ticker}: ${(err as Error).message}`);
    }
  }

  const counts = await prisma.asset.groupBy({ by: ["assetType"], _count: true });
  const summary = counts.map((c) => `${c.assetType}=${c._count}`).join(", ");

  return { ok, failed, message: `Universe tersimpan: ${summary}` };
}

runJob("seedUniverse", seed).finally(finish);
