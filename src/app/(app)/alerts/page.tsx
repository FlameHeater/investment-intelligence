import { Bell, TrendingUp, Newspaper, Activity } from "lucide-react";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/client";
import { formatRelative } from "@/lib/format";
import { Card, Disclaimer, EmptyState, SectionTitle, TickerLink } from "@/components/ui";
import { MarkAllRead } from "./MarkAllRead";
import { DeleteAlert } from "./DeleteAlert";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alert" };

const EVENT_ICON: Record<string, typeof Bell> = {
  score_change: TrendingUp,
  price: Activity,
  news: Newspaper,
  alert: Bell,
};

const SEVERITY_STYLE: Record<string, string> = {
  info: "border-line",
  warning: "border-warn/40 bg-warn/5",
  critical: "border-danger/40 bg-danger/5",
};

export default async function AlertsPage() {
  const [events, alerts, unread] = await Promise.all([
    prisma.alertEvent.findMany({
      include: { asset: { select: { ticker: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.alert.findMany({
      include: { asset: { select: { ticker: true, name: true, currency: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.alertEvent.count({ where: { readAt: null } }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alert</h1>
          <p className="mt-1 max-w-3xl text-sm text-fg-muted">
            Riwayat kejadian yang terdeteksi pada aset yang dipantau, beserta penjelasan penyebabnya.
            {!aiEnabled() && (
              <span className="text-warn">
                {" "}
                ANTHROPIC_API_KEY/GEMINI_API_KEY belum diisi, jadi kejadian tercatat tanpa penjelasan AI.
              </span>
            )}
          </p>
        </div>
        {unread > 0 && <MarkAllRead count={unread} />}
      </div>

      {/* Alert yang dibuat manual */}
      <Card>
        <SectionTitle
          title="Alert yang Anda buat"
          subtitle="Diperiksa setiap kali job watchlist berjalan"
        />
        {alerts.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Belum ada. Buat dari halaman aset lewat tombol &ldquo;Alert harga&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {alerts.map((alert) => {
              const condition = JSON.parse(alert.conditionJson) as {
                operator: string;
                value: number;
              };
              return (
                <li key={alert.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <TickerLink ticker={alert.asset.ticker} />
                      <span className="tnum text-sm text-fg-muted">
                        {condition.operator === "gt" ? "di atas" : "di bawah"} {condition.value}{" "}
                        {alert.asset.currency}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {alert.lastTriggeredAt
                        ? `Terakhir terpicu ${formatRelative(alert.lastTriggeredAt)}`
                        : "Belum pernah terpicu"}
                    </p>
                  </div>
                  <DeleteAlert id={alert.id} ticker={alert.asset.ticker} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Feed kejadian */}
      <section aria-labelledby="feed-title">
        <h2 id="feed-title" className="mb-3 text-base font-semibold">
          Riwayat kejadian
        </h2>

        {events.length === 0 ? (
          <EmptyState
            title="Belum ada kejadian tercatat"
            description="Tambahkan aset ke watchlist, lalu jalankan `npm run job:watchlist`. Kejadian dicatat kalau skor bergeser minimal 5 poin, harga bergerak minimal 5% dalam sehari, atau ada berita dari sumber resmi."
          />
        ) : (
          <ul className="space-y-2.5">
            {events.map((event) => {
              const Icon = EVENT_ICON[event.eventType] ?? Bell;
              return (
                <li
                  key={event.id}
                  className={clsx(
                    "rounded border bg-surface p-4",
                    SEVERITY_STYLE[event.severity] ?? "border-line",
                    !event.readAt && "ring-1 ring-info/20",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Icon
                      size={16}
                      aria-hidden="true"
                      className={clsx(
                        "mt-0.5 shrink-0",
                        event.severity === "critical"
                          ? "text-danger"
                          : event.severity === "warning"
                            ? "text-warn"
                            : "text-info",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{event.title}</p>
                        <span className="shrink-0 text-xs text-fg-subtle">
                          {formatRelative(event.createdAt)}
                          {!event.readAt && (
                            <span className="ml-2 text-info" aria-label="Belum dibaca">
                              baru
                            </span>
                          )}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-fg-muted">{event.detail}</p>

                      {event.explanation ? (
                        <div className="mt-2.5 rounded border-l-2 border-info/60 bg-surface-2 px-3 py-2">
                          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                            Penjelasan berdasarkan data sebelum-sesudah
                          </p>
                          <p className="text-xs leading-relaxed text-fg-muted">
                            {event.explanation}
                          </p>
                        </div>
                      ) : (
                        event.eventType !== "news" && (
                          <p className="mt-2 text-xs text-fg-subtle">
                            Tidak ada penjelasan AI untuk kejadian ini.
                          </p>
                        )
                      )}

                      <div className="mt-2">
                        <TickerLink ticker={event.asset.ticker} name={event.asset.name} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Disclaimer />
    </div>
  );
}
