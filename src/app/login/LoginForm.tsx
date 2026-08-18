"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Password salah.");
    } catch {
      setError("Tidak bisa menghubungi server. Pastikan aplikasi sedang berjalan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? "login-error" : "login-hint"}
          aria-invalid={error ? true : undefined}
          className="h-11 w-full rounded border border-line bg-bg px-3 text-base text-fg outline-none transition-colors focus:border-info"
        />
        <p id="login-hint" className="mt-1.5 text-xs text-fg-subtle">
          Nilai dari APP_PASSWORD di berkas .env Anda.
        </p>
      </div>

      {error && (
        <p
          id="login-error"
          role="alert"
          className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-down"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || password.length === 0}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded bg-accent font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {loading ? "Memeriksa..." : "Masuk"}
      </button>
    </form>
  );
}
