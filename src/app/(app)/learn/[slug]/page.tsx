import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { getArticle, listArticles } from "@/lib/learning";
import { Disclaimer } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug);
  return { title: article?.title ?? "Artikel" };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const all = await listArticles();
  const index = all.findIndex((a) => a.slug === slug);
  const next = all[index + 1];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/learn"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Semua artikel
      </Link>

      <header>
        <p className="text-xs uppercase tracking-wide text-fg-subtle">{article.category}</p>
        <h1 className="mt-1 text-2xl font-semibold">{article.title}</h1>
        <p className="mt-2 flex items-center gap-3 text-xs text-fg-subtle">
          <span className="rounded border border-line px-1.5 py-0.5">{article.level}</span>
          <span className="flex items-center gap-1">
            <Clock size={11} aria-hidden="true" />
            {article.readingMinutes} menit baca
          </span>
        </p>
      </header>

      {/*
        Gaya artikel didefinisikan eksplisit di sini alih-alih memakai plugin
        typography, supaya warna tetap terikat pada token tema yang sama dengan
        seluruh aplikasi.
      */}
      <article className="space-y-4 text-[15px] leading-relaxed text-fg-muted">
        <ReactMarkdown
          components={{
            h2: ({ children }) => (
              <h2 className="mt-8 border-b border-line pb-2 text-lg font-semibold text-fg">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-6 text-base font-semibold text-fg">{children}</h3>
            ),
            p: ({ children }) => <p className="max-w-prose">{children}</p>,
            ul: ({ children }) => (
              <ul className="max-w-prose list-disc space-y-1.5 pl-5">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="max-w-prose list-decimal space-y-1.5 pl-5">{children}</ol>
            ),
            strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
            code: ({ children }) => (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-fg">
                {children}
              </code>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-accent/60 bg-surface-2 py-2 pl-4 pr-3">
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <div className="table-scroll">
                <table className="w-full min-w-[500px] border border-line text-sm">{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border border-line bg-surface-2 px-3 py-2 text-left font-medium text-fg">
                {children}
              </th>
            ),
            td: ({ children }) => <td className="border border-line px-3 py-2">{children}</td>,
            a: ({ href, children }) => (
              <a href={href} className="text-info underline underline-offset-2">
                {children}
              </a>
            ),
          }}
        >
          {article.body}
        </ReactMarkdown>
      </article>

      {next && (
        <Link
          href={`/learn/${next.slug}`}
          className="card block p-4 transition-colors hover:border-line-strong"
        >
          <p className="text-xs text-fg-subtle">Artikel berikutnya</p>
          <p className="mt-0.5 font-medium">{next.title}</p>
          <p className="mt-1 text-sm text-fg-muted">{next.summary}</p>
        </Link>
      )}

      <Disclaimer />
    </div>
  );
}
