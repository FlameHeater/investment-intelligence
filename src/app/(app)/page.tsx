import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Activity,
  Database,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { getOverview, type MoverRow } from "@/lib/overview";
import { getActiveMode } from "@/lib/settings";
import { MODES } from "@/lib/modes";
import { ASSET_TYPE_LABEL } from "@/lib/types";
import { formatPercent, formatPrice, formatRelative } from "@/lib/format";
import {
  Card,
  Delta,
  EmptyState,
  ScorePill,
  SectionTitle,
  Stat,
  TickerLink,
} from "@/components/ui";
import { SearchBox } from "@/components/SearchBox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

function MarketUpdatedBadge({
  lastUpdated,
  stale,
}: {
  lastUpdated: Date | null;
  stale: boolean;
}) {
  return (
    <span
      className={
        stale
          ? "inline-flex items-center gap-1.5 rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-xs text-warn"
          : "inline-flex items-center gap-1.5 rounded border border-line bg-muted px-2 py-0.5 text-xs text-fg-muted"
      }
    >
      {stale ? (
        <AlertTriangle size={12} aria-hidden="true" />
      ) : (
        <Clock size={12} aria-hidden="true" />
      )}
      {lastUpdated ? formatRelative(lastUpdated) : "belum ada data"}
    </span>
  );
}

function MoverList({ rows, emptyText }: { rows: MoverRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-fg-subtle">{emptyText}</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.ticker} className="flex items-center justify-between gap-3 py-2">
          <TickerLink ticker={row.ticker} name={row.name} className="min-w-0 flex-1" />
          <div className="shrink-0 text-right">
            <p className="tnum text-sm">{formatPrice(row.price, row.currency)}</p>
            <Delta value={row.change1d} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const mode = await getActiveMode();
  const overview = await getOverview(mode);
  const modeConfig = MODES[mode];

  if (overview.totalAssets === 0) {
    return (
      <EmptyState
        title="Universe belum di-seed"
        description="Database masih kosong. Jalankan `npm run setup` di terminal untuk mengisi daftar aset, mengambil data harga, dan menghitung skor pertama. Prosesnya butuh beberapa menit karena provider gratis punya batas laju."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Mode <span className="font-medium text-fg">{modeConfig.label}</span> —{" "}
            {modeConfig.tagline}. {overview.totalAssets} aset dipantau, semuanya dibaca dari cache
            lokal.
          </p>
        </div>
        <SearchBox />
      </div>

      {overview.needsSetup && (
        <div className="rounded border border-warn/40 bg-warn/10 p-4 text-sm">
          <p className="font-medium text-warn">Belum ada data harga</p>
          <p className="mt-1 text-fg-muted">
            Universe sudah terisi tapi belum ada harga tersimpan. Jalankan{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npm run job:market</code>{" "}
            lalu{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npm run job:score</code>
            .
          </p>
        </div>
      )}

      {/* Ringkasan per kelas aset */}
      <section aria-labelledby="ringkasan-pasar">
        <h2 id="ringkasan-pasar" className="sr-only">
          Ringkasan pasar
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overview.markets.map((market) => (
            <Card key={market.assetType}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{ASSET_TYPE_LABEL[market.assetType]}</p>
                  <p className="text-xs text-fg-subtle">
                    {market.withPriceData}/{market.assetCount} aset punya data harga
                  </p>
                </div>
                <MarketUpdatedBadge
                  lastUpdated={market.lastUpdated}
                  stale={market.staleCount > market.assetCount / 2}
                />
              </div>

              <div className="mt-3 flex items-baseline gap-3">
                <span
                  className={`tnum text-2xl font-semibold ${
                    (market.medianChange1d ?? 0) > 0
                      ? "text-up"
                      : (market.medianChange1d ?? 0) < 0
                        ? "text-down"
                        : "text-fg"
                  }`}
                >
                  {formatPercent(market.medianChange1d, 2)}
                </span>
                <span className="text-xs text-fg-subtle">median 1 hari</span>
              </div>

              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-up">
                  <TrendingUp size={12} aria-hidden="true" />
                  {market.advancing} naik
                </span>
                <span className="flex items-center gap-1 text-down">
                  <TrendingDown size={12} aria-hidden="true" />
                  {market.declining} turun
                </span>
                {market.avgScore !== null && (
                  <span className="ml-auto text-fg-subtle">
                    skor rata-rata {market.avgScore.toFixed(0)}
                  </span>
                )}
              </div>

              {market.staleCount > 0 && (
                <p className="mt-2 text-xs text-warn">
                  {market.staleCount} aset datanya lebih tua dari 48 jam.
                </p>
              )}
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle
            title="Naik terbesar"
            subtitle="1 hari, hanya aset dengan data segar"
          />
          <MoverList rows={overview.topGainers} emptyText="Belum ada data pergerakan harga." />
        </Card>

        <Card>
          <SectionTitle title="Turun terbesar" subtitle="1 hari, hanya aset dengan data segar" />
          <MoverList rows={overview.topLosers} emptyText="Belum ada data pergerakan harga." />
        </Card>

        <Card>
          <SectionTitle
            title="Skor tertinggi"
            subtitle={
              overview.topScoresFiltered
                ? `Mode ${modeConfig.label} · confidence minimal ${(overview.confidenceFloor * 100).toFixed(0)}%`
                : `Mode ${modeConfig.label}`
            }
            action={
              <Link href="/screener" className="text-xs text-info hover:underline">
                Buka screener
              </Link>
            }
          />
          {overview.topScores.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-subtle">
              Belum ada skor. Jalankan{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">npm run job:score</code>.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {overview.topScores.map((row) => (
                <li key={row.ticker} className="flex items-center justify-between gap-3 py-2">
                  <TickerLink ticker={row.ticker} name={row.name} className="min-w-0 flex-1" />
                  <ScorePill score={row.score} confidence={row.confidence} size="sm" />
                </li>
              ))}
            </ul>
          )}

          {overview.topScores.length > 0 &&
            (overview.topScoresFiltered ? (
              overview.excludedLowConfidence > 0 && (
                <p className="mt-3 border-t border-line pt-2.5 text-xs text-fg-subtle">
                  {overview.excludedLowConfidence} aset lain tidak ditampilkan di sini karena
                  confidence-nya di bawah {(overview.confidenceFloor * 100).toFixed(0)}%. Semuanya
                  tetap bisa ditemukan lewat screener.
                </p>
              )
            ) : (
              <p className="mt-3 border-t border-line pt-2.5 text-xs text-warn">
                Tidak ada aset yang mencapai ambang confidence{" "}
                {(overview.confidenceFloor * 100).toFixed(0)}% untuk mode {modeConfig.label}, jadi
                daftar di atas ditampilkan apa adanya. Semua skor itu dihitung dari data yang
                tidak lengkap — jangan bandingkan satu sama lain sebelum data fundamental terisi.
              </p>
            ))}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle
            title="Perubahan di watchlist"
            subtitle="Selisih skor terhadap perhitungan sebelumnya"
            action={
              <Link href="/watchlist" className="text-xs text-info hover:underline">
                Kelola
              </Link>
            }
          />
          {overview.watchlistChanges.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-subtle">
              Watchlist masih kosong. Buka halaman aset mana pun lalu klik &ldquo;Pantau&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {overview.watchlistChanges.slice(0, 8).map((item) => (
                <li key={item.ticker} className="flex items-center justify-between gap-3 py-2">
                  <TickerLink ticker={item.ticker} name={item.name} className="min-w-0 flex-1" />
                  <div className="shrink-0 text-right">
                    <ScorePill score={item.score} size="sm" />
                    <p className="mt-0.5 text-xs">
                      {item.scoreDelta === null ? (
                        <span className="text-fg-subtle">skor pertama</span>
                      ) : (
                        <span
                          className={
                            item.scoreDelta > 0
                              ? "text-up"
                              : item.scoreDelta < 0
                                ? "text-down"
                                : "text-fg-subtle"
                          }
                        >
                          {item.scoreDelta > 0 ? "+" : ""}
                          {item.scoreDelta.toFixed(1)} poin
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle
            title="Kejadian terbaru"
            subtitle="Perubahan yang terdeteksi pada aset yang dipantau"
            action={
              <Link href="/alerts" className="text-xs text-info hover:underline">
                Semua alert
              </Link>
            }
          />
          {overview.recentAlerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-subtle">
              Belum ada kejadian tercatat.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {overview.recentAlerts.map((event) => (
                <li key={event.id} className="rounded border border-line bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{event.title}</p>
                    <span className="shrink-0 text-xs text-fg-subtle">
                      {formatRelative(event.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{event.detail}</p>
                  {event.explanation && (
                    <p className="mt-2 border-l-2 border-info/50 pl-2 text-xs text-fg-muted">
                      {event.explanation}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Transparansi pipeline data — bagian dari prinsip "no black box" */}
      <Card>
        <SectionTitle
          title="Status pipeline data"
          subtitle="Kapan terakhir tiap job berjalan, dan hasilnya"
        />
        {overview.jobs.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            Belum ada job yang tercatat. Jalankan{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">npm run job:all</code>.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overview.jobs.map((job) => (
              <Stat
                key={job.job}
                label={job.job}
                value={
                  <span className="flex items-center gap-1.5 text-base">
                    {job.job.includes("refresh") ? (
                      <Database size={14} aria-hidden="true" />
                    ) : job.job.includes("score") ? (
                      <Trophy size={14} aria-hidden="true" />
                    ) : (
                      <Activity size={14} aria-hidden="true" />
                    )}
                    {formatRelative(job.startedAt)}
                  </span>
                }
                hint={`${job.ok} berhasil, ${job.failed} gagal`}
                tone={job.failed > job.ok ? "warn" : "neutral"}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
