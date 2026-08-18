import Link from "next/link";
import { BookOpen, Clock } from "lucide-react";
import { listArticles } from "@/lib/learning";
import { METRICS } from "@/lib/metrics";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { AskAnything } from "./AskAnything";
import { aiEnabled } from "@/lib/ai/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Belajar" };

const LEVEL_STYLE: Record<string, string> = {
  dasar: "border-accent/40 text-accent",
  menengah: "border-info/40 text-info",
  lanjut: "border-warn/40 text-warn",
};

export default async function LearnPage() {
  const articles = await listArticles();
  const byCategory = new Map<string, typeof articles>();
  for (const a of articles) {
    byCategory.set(a.category, [...(byCategory.get(a.category) ?? []), a]);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Belajar</h1>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">
          Prinsip produk ini adalah <em>Education Over Dependency</em>: tujuannya bukan membuat Anda
          bergantung pada skor, tapi supaya Anda paham cara membaca angkanya sendiri.
        </p>
      </div>

      <AskAnything aiAvailable={aiEnabled()} />

      {articles.length === 0 ? (
        <EmptyState
          title="Belum ada artikel"
          description="Tambahkan berkas markdown ke src/content/learning/ dengan frontmatter title, category, level, summary, dan order."
        />
      ) : (
        [...byCategory.entries()].map(([category, list]) => (
          <section key={category}>
            <SectionTitle title={category} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((article) => (
                <Link key={article.slug} href={`/learn/${article.slug}`} className="group">
                  <Card className="h-full transition-colors group-hover:border-line-strong">
                    <div className="flex items-start justify-between gap-2">
                      <BookOpen size={16} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] ${LEVEL_STYLE[article.level] ?? "border-line text-fg-muted"}`}
                      >
                        {article.level}
                      </span>
                    </div>
                    <h3 className="mt-2 font-medium group-hover:text-accent">{article.title}</h3>
                    <p className="mt-1.5 line-clamp-3 text-sm text-fg-muted">{article.summary}</p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
                      <Clock size={11} aria-hidden="true" />
                      {article.readingMinutes} menit baca
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      <Card>
        <SectionTitle
          title="Glosarium metrik"
          subtitle="Semua istilah yang muncul di screener dan halaman aset"
        />
        <dl className="grid gap-x-8 gap-y-0 lg:grid-cols-2">
          {METRICS.map((metric) => (
            <div key={metric.key} className="border-b border-line/60 py-2.5">
              <dt className="text-sm font-medium">{metric.label}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-fg-muted">{metric.description}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
