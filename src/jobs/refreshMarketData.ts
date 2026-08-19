import { refreshMarketData, type AssetScope } from "../lib/refreshJobs";
import { finish, progress, runJob } from "./_runner";

/**
 * Job utama pengisi cache harga (PRD §7 poin 2).
 * Logikanya ada di lib/refreshJobs.ts supaya tombol "Perbarui data" di UI
 * menjalankan kode yang persis sama.
 *
 * Flag CLI:
 *   --full                      ambil riwayat 2 tahun (default 1 tahun)
 *   --only=us,idx,crypto,gold   batasi kelas aset
 */
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg
  ? (onlyArg.slice("--only=".length).split(",").filter(Boolean) as AssetScope[])
  : undefined;

runJob("refreshMarketData", () =>
  refreshMarketData({
    only,
    full: args.includes("--full"),
    onProgress: (done, total, label) => progress(done, total, label),
  }),
).finally(finish);
