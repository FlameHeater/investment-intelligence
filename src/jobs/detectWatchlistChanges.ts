import { runWatchlistDetection } from "../lib/jobRunners";
import { finish, runJob } from "./_runner";

/**
 * Fase 7 PRD: Smart Watchlist.
 * Yang dicari bukan "harga menyentuh X", melainkan PERUBAHAN yang layak
 * diperhatikan — pergeseran skor, lompatan harga, dan berita resmi baru.
 * Logikanya ada di lib/jobRunners.ts (dipakai bersama endpoint cron).
 */
runJob("detectWatchlistChanges", runWatchlistDetection).finally(finish);
