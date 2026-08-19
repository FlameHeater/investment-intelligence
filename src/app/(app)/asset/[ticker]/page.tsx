import { notFound } from "next/navigation";
import { ExternalLink, Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { prisma } from "@/lib/db";
import { buildSnapshot, findAssetByTicker } from "@/lib/assetService";
import { getActiveMode } from "@/lib/settings";
import { MODES } from "@/lib/modes";
import { scoreLabel } from "@/lib/scoring/orchestrator";
import { metricsFor } from "@/lib/metrics";
import { ASSET_TYPE_LABEL } from "@/lib/types";
import type { AiReasoning, ScoreBreakdown } from "@/lib/types";
import {
  formatDateTime,
  formatMetric,
  formatNumber,
  formatPercent,
  formatPrice,
  formatRelative,
} from "@/lib/format";
import {
  Card,
  Delta,
  Disclaimer,
  FreshnessBadge,
  ScorePill,
  SectionTitle,
  SourceBadge,
  Stat,
} from "@/components/ui";
import { PriceChart } from "@/components/PriceChart";
import { ScoreBreakdownPanel } from "@/components/ScoreBreakdown";
import { AssetActions } from "@/components/AssetActions";
import { TermTooltip } from "@/components/TermTooltip";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: decodeURIComponent(ticker).toUpperCase() };
}

export default async function AssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const asset = await findAssetByTicker(decodeURIComponent(raw));
  if (!asset) notFound();

  const mode = await getActiveMode();
  const modeConfig = MODES[mode];

  const [snapshot, latestScore, news, watchlistItem] = await Promise.all([
    buildSnapshot(asset),
    prisma.analysisScore.findFirst({
      where: { assetId: asset.id, investmentMode: mode },
      orderBy: { createdAt: "desc" },
    }),
    prisma.news.findMany({
      where: { assetId: asset.id },
      orderBy: { publishedAt: "desc" },
      take: 12,
    }),
    prisma.watchlistItem.findUnique({ where: { assetId: asset.id } }),
  ]);

  const t = snapshot.technical;
  const breakdown = latestScore?.breakdownJson
    ? (JSON.parse(latestScore.breakdownJson) as {
        breakdown: ScoreBreakdown;
        effectiveWeights: Record<string, number>;
        warnings: string[];
      })
    : null;
  const reasoning = latestScore?.reasoningJson
    ? (JSON.parse(latestScore.reasoningJson) as AiReasoning)
    : null;

  const availableMetrics = metricsFor(asset.assetType);
  const fundamentalMetrics = availableMetrics.filter(
    (m) => m.group === "fundamental" || m.group === "valuation",
  );

  const label = latestScore ? scoreLabel(latestScore.overallScore) : null;
  const lowConfidence = latestScore ? latestScore.confidence < modeConfig.confidenceFloor : false;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold">{asset.ticker}</h1>
            <span className="rounded border border-line px-2 py-0.5 text-xs text-fg-muted">
              {ASSET_TYPE_LABEL[asset.assetType]}
            </span>
            {/* Untuk kripto, sektor selalu "Kripto" — sama dengan label kelas
                asetnya, jadi menampilkannya dua kali hanya jadi derau. */}
            {asset.sector && asset.sector !== ASSET_TYPE_LABEL[asset.assetType] && (
              <span className="rounded border border-line px-2 py-0.5 text-xs text-fg-muted">
                {asset.sector}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {asset.name}
            {asset.exchange && <span className="text-fg-subtle"> · {asset.exchange}</span>}
          </p>

          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className="tnum text-3xl font-semibold">
              {formatPrice(t.price, asset.currency)}
            </span>
            <Delta value={t.change1d} />
            <FreshnessBadge
              freshness={snapshot.freshness}
              lastUpdated={snapshot.lastPriceAt}
              source={snapshot.source}
              stale={snapshot.stale}
            />
          </div>

          {snapshot.stale && (
            <p className="mt-2 max-w-xl rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              Data harga terakhir berasal dari {formatDateTime(snapshot.lastPriceAt)}. Angka di
              halaman ini tidak menggambarkan kondisi terkini. Jalankan{" "}
              <code className="font-mono">npm run job:market</code> untuk memperbarui.
            </p>
          )}
        </div>

        <AssetActions
          ticker={asset.ticker}
          inWatchlist={Boolean(watchlistItem)}
          currency={asset.currency}
          lastPrice={t.price}
        />
      </div>

      {/* Ringkasan angka kunci */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Stat
          label="1 minggu"
          value={formatPercent(t.change7d, 2)}
          tone={(t.change7d ?? 0) > 0 ? "up" : (t.change7d ?? 0) < 0 ? "down" : "neutral"}
        />
        <Stat
          label="1 bulan"
          value={formatPercent(t.change30d, 2)}
          tone={(t.change30d ?? 0) > 0 ? "up" : (t.change30d ?? 0) < 0 ? "down" : "neutral"}
        />
        <Stat
          label="3 bulan"
          value={formatPercent(t.change90d, 2)}
          tone={(t.change90d ?? 0) > 0 ? "up" : (t.change90d ?? 0) < 0 ? "down" : "neutral"}
        />
        <Stat
          label="RSI (14)"
          value={t.rsi14 === null ? "—" : formatNumber(t.rsi14, 1)}
          hint={
            t.rsi14 === null
              ? "butuh 15 bar"
              : t.rsi14 > 70
                ? "area jenuh beli"
                : t.rsi14 < 30
                  ? "area jenuh jual"
                  : "netral"
          }
          tone={t.rsi14 !== null && (t.rsi14 > 70 || t.rsi14 < 30) ? "warn" : "neutral"}
        />
        <Stat
          label="Volatilitas tahunan"
          value={t.volatility === null ? "—" : `${(t.volatility * 100).toFixed(0)}%`}
          hint="dari return 90 hari"
        />
        <Stat
          label="Dari puncak 52 mgg"
          value={formatPercent(t.distanceFromHigh52w, 1)}
          hint={t.high52w ? formatPrice(t.high52w, asset.currency) : "data belum cukup"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Chart + fundamental */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <SectionTitle
              title="Pergerakan harga"
              subtitle={`Sumber: ${snapshot.source ?? "belum ada"} · disimpan di cache lokal`}
            />
            <PriceChart ticker={asset.ticker} currency={asset.currency} />
          </Card>

          <Card>
            <SectionTitle
              title="Fundamental & valuasi"
              subtitle={
                snapshot.fundamentalSource
                  ? `Sumber: ${snapshot.fundamentalSource}`
                  : "Belum ada data tersimpan"
              }
            />

            {/*
              Dua sebab yang berbeda dan tidak boleh tertukar:
              tidak ada metrik yang BERLAKU (kripto, emas) versus metriknya
              berlaku tapi sumbernya sedang mati (saham). Sebelumnya kedua
              saham jatuh ke cabang pertama dan halaman emiten IDX menampilkan
              "Emas adalah komoditas tanpa laporan keuangan" — keliru, dan
              justru jenis kekeliruan yang paling merusak di aplikasi yang
              seluruh nilainya bertumpu pada kejujuran soal data.
            */}
            {fundamentalMetrics.length === 0 ? (
              <p
                className={
                  asset.assetType === "crypto" || asset.assetType === "gold"
                    ? "rounded border border-line bg-surface-2 p-3 text-sm text-fg-muted"
                    : "rounded border border-warn/40 bg-warn/10 p-3 text-sm text-warn"
                }
              >
                {asset.assetType === "crypto"
                  ? "Kripto tidak punya laporan keuangan, jadi tidak ada metrik fundamental atau valuasi yang berlaku. Ini bukan data yang hilang — memang tidak ada."
                  : asset.assetType === "gold"
                    ? "Emas adalah komoditas tanpa laporan keuangan. Penilaian untuk aset ini sepenuhnya bertumpu pada harga dan risiko."
                    : asset.assetType === "idx_stock"
                      ? "Metrik fundamental berlaku untuk emiten ini, tapi sumbernya sedang tidak aktif. Aktifkan ENABLE_PLUANG_SCRAPE lalu jalankan Perbarui data. Selama itu belum dilakukan, confidence skor ikut turun."
                      : "Metrik fundamental berlaku untuk saham ini, tapi sumbernya sedang tidak aktif. Isi FINNHUB_API_KEY lalu jalankan Perbarui data."}
              </p>
            ) : snapshot.fundamentals.size === 0 ? (
              <p className="rounded border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
                {asset.assetType === "idx_stock"
                  ? "Belum ada data fundamental tersimpan untuk emiten ini. Sumbernya opsional dan mati secara default — aktifkan ENABLE_PLUANG_SCRAPE lalu jalankan Perbarui data. Selama kosong, confidence skor ikut turun dan bagian ini sengaja dibiarkan kosong alih-alih diisi angka perkiraan."
                  : "Belum ada data fundamental tersimpan. Isi FINNHUB_API_KEY di .env lalu jalankan `npm run job:fundamentals`."}
              </p>
            ) : (
              <dl className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
                {fundamentalMetrics.map((metric) => {
                  const value = snapshot.fundamentals.get(metric.key) ?? null;
                  return (
                    <div
                      key={metric.key}
                      className="flex items-center justify-between gap-3 border-b border-line/60 py-2"
                    >
                      <dt className="text-sm text-fg-muted">
                        <TermTooltip
                          term={metric.key}
                          label={metric.label}
                          definition={metric.description}
                          context={{ [metric.key]: value, ticker: asset.ticker }}
                        />
                      </dt>
                      <dd
                        className={`tnum text-sm ${value === null ? "text-fg-subtle" : "font-medium"}`}
                      >
                        {value === null
                          ? "tidak tersedia"
                          : formatMetric(value, metric.format, asset.currency)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </Card>

          {/* AI Reasoning — Fase 5 */}
          <Card>
            <SectionTitle
              title="AI Reasoning"
              subtitle={
                reasoning
                  ? `Dibuat ${formatRelative(reasoning.generatedAt)} dengan ${reasoning.model}`
                  : "Belum dibuat untuk skor terakhir"
              }
            />

            {!reasoning ? (
              <div className="rounded border border-dashed border-line-strong p-5 text-center">
                <Sparkles size={20} className="mx-auto text-fg-subtle" aria-hidden="true" />
                <p className="mt-2 text-sm text-fg-muted">
                  Klik <span className="font-medium text-fg">Hitung ulang + AI Reasoning</span> di
                  atas untuk meminta penjelasan atas skor ini.
                </p>
                <p className="mx-auto mt-1.5 max-w-md text-xs text-fg-subtle">
                  Claude hanya menerima angka dan berita yang sudah tersimpan di database ini. Ia
                  tidak mencari data sendiri, dan diinstruksikan menyatakan secara eksplisit ketika
                  sebuah data tidak tersedia.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed">{reasoning.summary}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-accent/30 bg-accent/5 p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-accent">
                      <TrendingUp size={13} aria-hidden="true" />
                      Faktor pendukung
                    </p>
                    {reasoning.supportingFactors.length === 0 ? (
                      <p className="text-xs text-fg-subtle">tidak ada yang menonjol</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {reasoning.supportingFactors.map((f, i) => (
                          <li key={i} className="text-xs leading-relaxed text-fg-muted">
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded border border-down/30 bg-down/5 p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-down">
                      <TrendingDown size={13} aria-hidden="true" />
                      Faktor yang bertentangan
                    </p>
                    {reasoning.contradictingFactors.length === 0 ? (
                      <p className="text-xs text-fg-subtle">tidak ada yang menonjol</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {reasoning.contradictingFactors.map((f, i) => (
                          <li key={i} className="text-xs leading-relaxed text-fg-muted">
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {reasoning.dataGaps.length > 0 && (
                  <div className="rounded border border-warn/30 bg-warn/5 p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-warn">
                      <Minus size={13} aria-hidden="true" />
                      Data yang tidak tersedia
                    </p>
                    <ul className="space-y-1.5">
                      {reasoning.dataGaps.map((g, i) => (
                        <li key={i} className="text-xs leading-relaxed text-fg-muted">
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
                    Skenario
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["bull", "Bull", "border-accent/30"],
                        ["base", "Base", "border-info/30"],
                        ["bear", "Bear", "border-down/30"],
                      ] as const
                    ).map(([key, title, border]) => (
                      <div key={key} className={`rounded border ${border} bg-surface-2 p-3`}>
                        <p className="mb-1 text-xs font-medium">{title}</p>
                        <p className="text-xs leading-relaxed text-fg-muted">
                          {reasoning.scenarios[key]}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-fg-subtle">
                    Skenario adalah deskripsi kondisi, bukan prediksi harga. Model diinstruksikan
                    tidak menyebut target harga.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Skor + berita */}
        <div className="space-y-4">
          <Card>
            <SectionTitle
              title="Investment Score"
              subtitle={`Mode ${modeConfig.label} — ${modeConfig.tagline}`}
            />

            {!latestScore ? (
              <p className="rounded border border-dashed border-line-strong p-4 text-center text-sm text-fg-muted">
                Belum ada skor untuk mode ini. Klik &ldquo;Hitung ulang&rdquo; di atas.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-end gap-3">
                  <ScorePill score={latestScore.overallScore} size="lg" />
                  <div>
                    <p className="text-sm font-medium">{label?.label}</p>
                    <p className="text-xs text-fg-subtle">
                      dihitung {formatRelative(latestScore.createdAt)}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Confidence</span>
                    <span className={lowConfidence ? "tnum text-warn" : "tnum text-fg"}>
                      {(latestScore.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={lowConfidence ? "h-full bg-warn" : "h-full bg-info"}
                      style={{ width: `${latestScore.confidence * 100}%` }}
                    />
                  </div>
                  {lowConfidence && (
                    <p className="mt-1.5 text-xs text-warn">
                      Di bawah ambang mode {modeConfig.label} (
                      {(modeConfig.confidenceFloor * 100).toFixed(0)}%). Skor ini dihitung dari data
                      yang tidak lengkap — perlakukan sebagai indikasi kasar.
                    </p>
                  )}
                </div>

                {breakdown && (
                  <ScoreBreakdownPanel
                    breakdown={breakdown.breakdown}
                    effectiveWeights={breakdown.effectiveWeights}
                    warnings={breakdown.warnings}
                  />
                )}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle
              title="Berita"
              subtitle={`${snapshot.newsCount7d} artikel dalam 7 hari terakhir`}
            />

            {news.length === 0 ? (
              <p className="rounded border border-dashed border-line-strong p-4 text-center text-sm text-fg-muted">
                {asset.assetType === "us_stock"
                  ? "Belum ada berita tersimpan. Sumber berita saham AS butuh FINNHUB_API_KEY."
                  : asset.assetType === "idx_stock"
                    ? "Belum ada berita tersimpan. Jalankan Perbarui data — berita emiten IDX tidak butuh API key."
                    : "Belum ada sumber berita untuk kelas aset ini."}
              </p>
            ) : (
              <ul className="space-y-3">
                {news.map((item) => (
                  <li key={item.id} className="border-b border-line/60 pb-3 last:border-0 last:pb-0">
                    <a
                      href={item.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block"
                    >
                      <p className="text-sm leading-snug group-hover:text-info">
                        {item.title}
                        <ExternalLink
                          size={11}
                          className="ml-1 inline text-fg-subtle"
                          aria-hidden="true"
                        />
                      </p>
                    </a>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <SourceBadge sourceType={item.sourceType} />
                      <span className="text-xs text-fg-subtle">{item.source}</span>
                      <span className="text-xs text-fg-subtle">·</span>
                      <span className="text-xs text-fg-subtle">
                        {formatRelative(item.publishedAt)}
                      </span>
                      {item.sentiment && item.sentiment !== "neutral" && (
                        <span
                          className={`text-xs ${item.sentiment === "positive" ? "text-up" : "text-down"}`}
                        >
                          {item.sentiment === "positive" ? "nada positif" : "nada negatif"}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 border-t border-line pt-3 text-xs text-fg-subtle">
              Label sumber ditentukan aturan statis berdasarkan domain penerbit, bukan model
              klasifikasi. Nada berita dideteksi dengan pencocokan kata kunci sederhana.
            </p>
          </Card>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
