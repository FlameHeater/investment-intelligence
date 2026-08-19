import { runRescore } from "../lib/jobRunners";
import { finish, runJob } from "./_runner";

/**
 * Menghitung ulang Investment Score seluruh universe.
 * Logikanya ada di lib/jobRunners.ts supaya bisa dipakai juga oleh endpoint
 * cron dan tombol "Perbarui data" di UI.
 *
 * Scoring deterministik dan murni CPU — tidak memanggil provider dan tidak
 * memanggil Claude, jadi aman dijalankan sering. Yang mahal adalah AI Reasoning,
 * yang dipisah dan hanya berjalan on-demand per aset.
 *
 * Default menghitung KEEMPAT mode. Alasannya: skor disimpan per mode, jadi
 * kalau hanya mode aktif yang dihitung, mengganti mode lewat menu membuat
 * seluruh aplikasi tampak kosong sampai job dijalankan lagi.
 *
 * Flag CLI: --single-mode  → hanya mode yang sedang aktif
 */
const singleMode = process.argv.includes("--single-mode");

runJob("rescoreUniverse", () => runRescore({ allModes: !singleMode })).finally(finish);
