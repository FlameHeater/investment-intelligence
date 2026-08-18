import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

/**
 * Learning Center dari berkas markdown, bukan tabel database (PRD §9).
 * Untuk single-user, menulis artikel sebagai file jauh lebih praktis daripada
 * membangun CMS — dan artikelnya ikut ter-version-control bersama kode.
 */

const CONTENT_DIR = path.join(process.cwd(), "src", "content", "learning");

export interface Article {
  slug: string;
  title: string;
  category: string;
  level: "dasar" | "menengah" | "lanjut";
  summary: string;
  readingMinutes: number;
  order: number;
}

export interface ArticleWithBody extends Article {
  body: string;
}

async function parse(filename: string): Promise<ArticleWithBody> {
  const raw = await readFile(path.join(CONTENT_DIR, filename), "utf8");
  const { data, content } = matter(raw);
  const words = content.split(/\s+/).length;

  return {
    slug: filename.replace(/\.md$/, ""),
    title: String(data.title ?? filename),
    category: String(data.category ?? "Umum"),
    level: (data.level as Article["level"]) ?? "dasar",
    summary: String(data.summary ?? ""),
    readingMinutes: Math.max(1, Math.round(words / 200)),
    order: Number(data.order ?? 99),
    body: content,
  };
}

export async function listArticles(): Promise<Article[]> {
  let files: string[];
  try {
    files = (await readdir(CONTENT_DIR)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const articles = await Promise.all(files.map(parse));
  return articles
    .map(({ body: _body, ...rest }) => rest)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export async function getArticle(slug: string): Promise<ArticleWithBody | null> {
  try {
    return await parse(`${slug}.md`);
  } catch {
    return null;
  }
}
