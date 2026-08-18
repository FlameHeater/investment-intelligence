import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildSnapshot, type AssetRow } from "@/lib/assetService";
import { getActiveMode } from "@/lib/settings";
import { MODES } from "@/lib/modes";
import { ASSET_TYPE_LABEL } from "@/lib/types";
import { formatPrice, formatRelative } from "@/lib/format";
import {
  Card,
  Delta,
  Disclaimer,
  EmptyState,
  FreshnessBadge,
  ScorePill,
  SectionTitle,
  TickerLink,
} from "@/components/ui";
import { RemoveFromWatchlist } from "./RemoveButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  const mode = await getActiveMode();
  const items = await prisma.watchlistItem.findMany({
    include: { asset: true },
    orderBy: { addedAt: "desc" },
  });

  const rows = await Promise.all(
    items.map(async (item) => {
      const snapshot = await buildSnapshot(item.asset as AssetRow);
      const scores = await prisma.analysisScore.findMany({
        where: { assetId: item.assetId, investmentMode: mode },
        orderBy: { createdAt: "desc" },
        take: 2,
      });
      const events = await prisma.alertEvent.findMany({
        where: { assetId: item.assetId },
        orderBy: { createdAt: "desc" },
        take: 2,
      });

      return { item, snapshot, scores, events };
    }),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Watchlist</h1>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">
          Yang dipantau di sini bukan sekadar harga, tapi <em>perubahan</em>: pergeseran skor,
          lompatan harga, dan berita dari sumber resmi. Job{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">npm run job:watchlist</code>{" "}
          mendeteksinya, lalu Claude menjelaskan penyebabnya berdasarkan data sebelum-sesudah.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Watchlist masih kosong"
          description="Buka halaman aset mana pun lalu klik tombol Pantau. Setelah ada isinya, jalankan job watchlist untuk mulai mendeteksi perubahan."
          action={
            <Link
              href="/screener"
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              Cari aset lewat screener
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map(({ item, snapshot, scores, events }) => {
            const delta =
              scores.length === 2 ? scores[0].overallScore - scores[1].overallScore : null;

            return (
              <Card key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <TickerLink ticker={item.asset.ticker} />
                      <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-fg-muted">
                        {ASSET_TYPE_LABEL[item.asset.assetType as keyof typeof ASSET_TYPE_LABEL]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-fg-subtle">{item.asset.name}</p>
                  </div>
                  <RemoveFromWatchlist ticker={item.asset.ticker} />
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-3">
                  <span className="tnum text-xl font-semibold">
                    {formatPrice(snapshot.technical.price, item.asset.currency)}
                  </span>
                  <Delta value={snapshot.technical.change1d} />
                  <FreshnessBadge
                    freshness={snapshot.freshness}
                    lastUpdated={snapshot.lastPriceAt}
                    source={snapshot.source}
                    stale={snapshot.stale}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-fg-muted">Skor {MODES[mode].label}</span>
                    <ScorePill
                      score={scores[0]?.overallScore ?? null}
                      confidence={scores[0]?.confidence ?? null}
                      size="sm"
                    />
                  </div>
                  <span className="text-xs">
                    {delta === null ? (
                      <span className="text-fg-subtle">belum ada pembanding</span>
                    ) : Math.abs(delta) < 0.05 ? (
                      <span className="text-fg-subtle">tidak berubah</span>
                    ) : (
                      <span className={delta > 0 ? "text-up" : "text-down"}>
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(1)} poin sejak {formatRelative(scores[1].createdAt)}
                      </span>
                    )}
                  </span>
                </div>

                {item.notes && (
                  <p className="mt-2 rounded border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-fg-muted">
                    {item.notes}
                  </p>
                )}

                {events.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-line pt-3">
                    {events.map((event) => (
                      <li key={event.id}>
                        <p className="text-xs font-medium">{event.title}</p>
                        {event.explanation && (
                          <p className="mt-0.5 border-l-2 border-info/50 pl-2 text-xs text-fg-muted">
                            {event.explanation}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <Card>
          <SectionTitle
            title="Cara memancing deteksi perubahan"
            subtitle="Berguna untuk mencoba fitur ini tanpa menunggu pasar bergerak"
          />
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-fg-muted">
            <li>
              Jalankan{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">npm run job:market</code>{" "}
              untuk mengambil harga terbaru.
            </li>
            <li>
              Jalankan{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">npm run job:score</code> dua
              kali dengan jeda, supaya ada dua titik skor untuk dibandingkan.
            </li>
            <li>
              Jalankan{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">npm run job:watchlist</code>
              . Perubahan skor ≥5 poin atau harga ≥5% akan tercatat sebagai kejadian.
            </li>
          </ol>
        </Card>
      )}

      <Disclaimer />
    </div>
  );
}
