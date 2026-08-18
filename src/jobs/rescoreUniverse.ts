import { runRescore } from "../lib/jobRunners";
import { finish, runJob } from "./_runner";

/**
 * Menghitung ulang Investment Score seluruh universe.
 * Logikanya ada di lib/jobRunners.ts supaya bisa dipakai juga oleh Vercel Cron.
 *
 * Scoring deterministik dan murni CPU — tidak memanggil provider dan tidak
 * memanggil Claude, jadi aman dijalankan sering. Yang mahal adalah AI Reasoning,
 * yang dipisah dan hanya berjalan on-demand per aset.
 *
 * Flag CLI: --all-modes  → hitung untuk keempat mode, bukan hanya mode aktif
 */
const allModes = process.argv.includes("--all-modes");

runJob("rescoreUniverse", () => runRescore({ allModes })).finally(finish);
