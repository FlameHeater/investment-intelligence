import { refreshNews } from "../lib/refreshJobs";
import { finish, progress, runJob } from "./_runner";

/**
 * Pengisi tabel berita.
 *
 * Strategi kuota (PRD §4): Finnhub limitnya longgar (60/menit) jadi dipakai
 * untuk seluruh saham AS. Marketaux hanya 100 request/HARI, jadi sengaja
 * dibatasi ke aset yang ada di watchlist.
 */
runJob("refreshNews", () =>
  refreshNews({ onProgress: (d, t, l) => progress(d, t, l) }),
).finally(finish);
