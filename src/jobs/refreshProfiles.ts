import { refreshProfiles, type AssetScope } from "../lib/refreshJobs";
import { finish, progress, runJob } from "./_runner";

/**
 * Pengisi profil bisnis emiten (Fase Profil Emiten).
 *
 * Beda dari job lain: hanya menarik aset yang BELUM punya profil tersimpan
 * (lihat komentar di refreshProfiles). Aman dipanggil berulang — setelah
 * backfill awal, panggilan berikutnya nyaris tidak melakukan apa-apa.
 *
 * Flag CLI:
 *   --only=us,idx,crypto,gold   batasi kelas aset
 */
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg
  ? (onlyArg.slice("--only=".length).split(",").filter(Boolean) as AssetScope[])
  : undefined;

runJob("refreshProfiles", () =>
  refreshProfiles({ only, onProgress: (d, t, l) => progress(d, t, l) }),
).finally(finish);
