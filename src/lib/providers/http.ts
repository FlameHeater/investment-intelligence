/**
 * Utilitas HTTP bersama untuk semua provider.
 *
 * Kenapa ada rate limiter di sini: PRD §4 mencatat free tier 5-60 calls/menit.
 * Kalau job refresh menembak 250+ aset tanpa jeda, provider akan menolak dan
 * kita berisiko menyimpan data setengah jadi. Limiter memaksa jeda antar-panggilan
 * per provider, sehingga job berjalan lebih lambat tapi selesai utuh.
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Antrian serial dengan jeda minimum antar-panggilan. */
export class RateLimiter {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly minIntervalMs: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const value = await fn();
      await sleep(this.minIntervalMs);
      return value;
    });
    // rantai tetap jalan walau satu panggilan gagal
    this.queue = result.catch(() => undefined);
    return result;
  }
}

interface FetchOptions {
  provider: string;
  limiter?: RateLimiter;
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

async function fetchWithRetry(
  url: string,
  opts: FetchOptions,
  parse: (res: Response) => Promise<unknown>,
): Promise<unknown> {
  const { provider, limiter, retries = 2, timeoutMs = 15_000 } = opts;

  const attempt = async (tryIndex: number): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Endpoint publik Yahoo menolak request tanpa User-Agent browser.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "application/json",
          ...opts.headers,
        },
        cache: "no-store",
      });

      // 403/429 sengaja dibedakan dari kegagalan lain di pemanggil lewat
      // ProviderError.status — itu tanda diblokir/rate-limited, bukan sekadar
      // data tidak ada, dan penting untuk didiagnosis terpisah.
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        throw new ProviderError(`HTTP ${res.status} dari ${provider}`, provider, res.status);
      }
      if (!res.ok) {
        throw new ProviderError(`HTTP ${res.status} dari ${provider}`, provider, res.status);
      }
      return await parse(res);
    } catch (err) {
      const retriable =
        err instanceof ProviderError
          ? err.status === 429 || err.status === 403 || (err.status ?? 0) >= 500
          : true;
      if (tryIndex < retries && retriable) {
        // backoff eksponensial: 1s, 2s, 4s
        await sleep(1000 * 2 ** tryIndex);
        return attempt(tryIndex + 1);
      }
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `Gagal memanggil ${provider}: ${(err as Error).message}`,
        provider,
      );
    } finally {
      clearTimeout(timer);
    }
  };

  return limiter ? limiter.run(() => attempt(0)) : attempt(0);
}

export async function fetchJson<T>(url: string, opts: FetchOptions): Promise<T> {
  return fetchWithRetry(url, opts, (res) => res.json()) as Promise<T>;
}

/** Sama seperti fetchJson, tapi untuk endpoint yang membalas HTML (mis. halaman
 * publik yang di-scrape). Melempar ProviderError dengan status HTTP kalau gagal,
 * supaya pemanggil bisa membedakan "diblokir/rate-limited" dari "kosong tapi valid". */
export async function fetchText(url: string, opts: FetchOptions): Promise<string> {
  return fetchWithRetry(url, opts, (res) => res.text()) as Promise<string>;
}
