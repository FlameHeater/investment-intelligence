import { RateLimiter } from "./http";
import { classifySource } from "./sourceType";
import type { NewsItem } from "./finnhub";

/**
 * Berita emiten IDX lewat Google News RSS.
 *
 * Kenapa sumber ini, setelah menguji beberapa alternatif:
 *
 * - RSS media keuangan Indonesia (Kontan, CNBC Indonesia, Detik) bersifat
 *   pasar-luas. Dari 128 judul yang diuji, hanya SATU yang bisa dikaitkan ke
 *   emiten tertentu — media di sini jarang menyebut kode emiten di judul,
 *   sehingga pencocokan lokal nyaris tidak menghasilkan apa pun.
 * - Endpoint RSS Yahoo Finance untuk simbol .JK mengembalikan berita Indonesia
 *   umum berbahasa Inggris, bukan berita emitennya.
 * - Finnhub tidak mencakup IDX; endpoint non-AS-nya berbayar.
 * - Marketaux hanya memberi 100 request/hari di tier gratis — habis hanya untuk
 *   satu putaran 59 emiten.
 *
 * Google News RSS diuji pada enam emiten: 84-94 dari 100 judul memuat kode
 * emitennya, dari 22-34 penerbit berbeda, dengan sebagian terbit dalam dua hari
 * terakhir.
 *
 * PERINGATAN YANG HARUS TETAP DIINGAT: ini endpoint yang tidak resmi. Google
 * tidak menawarkannya sebagai API yang didukung, jadi ia bisa berubah atau
 * diblokir sewaktu-waktu. Statusnya sama dengan endpoint chart Yahoo Finance
 * yang sudah dipakai untuk harga IDX, dan PRD §4 menerima kompromi itu secara
 * eksplisit UNTUK PENGGUNAAN PRIBADI BERSKALA KECIL. Kalau aplikasi ini nanti
 * dibagikan ke orang lain atau dimonetisasi, sumber ini harus diganti dengan
 * penyedia berlisensi lebih dulu.
 */

// Jeda 1,3 detik: 59 emiten selesai dalam ~80 detik, cukup santai untuk endpoint
// yang tidak menjanjikan kuota apa pun.
const limiter = new RateLimiter(1300);

export const GOOGLE_NEWS_SOURCE = "google_news_rss";

/** Artikel lebih tua dari ini tidak dipakai scorer mana pun. */
const MAX_AGE_DAYS = 30;

const ITEM_SPLIT = "<item>";
const TITLE_RE = /<title>([\s\S]*?)<\/title>/;
const LINK_RE = /<link>([\s\S]*?)<\/link>/;
const PUBDATE_RE = /<pubDate>([\s\S]*?)<\/pubDate>/;
const SOURCE_RE = /<source[^>]*>([\s\S]*?)<\/source>/;

function field(chunk: string, re: RegExp): string {
  const m = chunk.match(re);
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * Google News menuliskan judul sebagai "Judul artikel - Nama Penerbit".
 * Nama penerbit juga tersedia di tag <source>, yang lebih andal karena judul
 * artikel sendiri bisa mengandung tanda hubung.
 */
function splitTitleAndSource(rawTitle: string, sourceTag: string): { title: string; source: string } {
  if (sourceTag) {
    const suffix = ` - ${sourceTag}`;
    return {
      title: rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length) : rawTitle,
      source: sourceTag,
    };
  }

  const idx = rawTitle.lastIndexOf(" - ");
  if (idx > 0) {
    return { title: rawTitle.slice(0, idx), source: rawTitle.slice(idx + 3) };
  }
  return { title: rawTitle, source: "Google News" };
}

/**
 * @param ticker kode emiten apa adanya dari database, mis. "BBCA.JK"
 */
export async function fetchIdxNews(ticker: string, limit = 12): Promise<NewsItem[]> {
  const code = ticker.replace(/\.JK$/i, "");

  // Kata "saham" dipakai sebagai penyaring konteks. Tanpa itu, kode empat huruf
  // seperti ANTM atau GOTO ikut menarik artikel yang tidak ada hubungannya.
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(`saham ${code}`)}` +
    `&hl=id&gl=ID&ceid=ID:id`;

  let xml: string;
  try {
    xml = await limiter.run(async () => {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
  } catch {
    // Kegagalan satu emiten tidak boleh menggagalkan seluruh job.
    return [];
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const out: NewsItem[] = [];
  const seen = new Set<string>();

  for (const chunk of xml.split(ITEM_SPLIT).slice(1)) {
    const rawTitle = field(chunk, TITLE_RE);
    const link = field(chunk, LINK_RE);
    if (!rawTitle || !link) continue;

    const publishedAt = new Date(field(chunk, PUBDATE_RE));
    // Query ini banyak menarik artikel jenis "Profil & Prospek" yang tidak
    // terikat waktu. Tanpa saringan umur, sentimen akan dihitung dari artikel
    // bertahun-tahun lalu.
    if (Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() < cutoff) continue;

    // Hanya ambil yang benar-benar menyebut kode emitennya, supaya berita pasar
    // umum tidak menempel ke emiten yang salah.
    if (!rawTitle.toUpperCase().includes(code.toUpperCase())) continue;

    const { title, source } = splitTitleAndSource(rawTitle, field(chunk, SOURCE_RE));

    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title,
      source,
      sourceType: classifySource(source),
      url: link,
      summary: null,
      publishedAt,
    });

    if (out.length >= limit) break;
  }

  return out;
}
