import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { Disclaimer } from "@/components/ui";

export const metadata = { title: "Masuk" };

export default function LoginPage() {
  const configured = Boolean(process.env.APP_PASSWORD && process.env.SESSION_SECRET);

  return (
    <main
      id="konten"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12"
    >
      <div>
        <div className="mb-4 flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded bg-accent font-mono font-bold text-accent-fg"
            aria-hidden="true"
          >
            II
          </span>
          <h1 className="text-xl font-semibold">Investment Intelligence</h1>
        </div>
        <p className="text-sm text-fg-muted">
          Alat bantu keputusan investasi personal untuk saham AS, saham IDX, kripto, dan emas.
          Aplikasi ini single-user — satu password untuk satu pemilik.
        </p>
      </div>

      {configured ? (
        <Suspense fallback={<div className="card h-40 animate-pulse" />}>
          <LoginForm />
        </Suspense>
      ) : (
        <div className="card p-5 text-sm">
          <p className="font-medium text-warn">Aplikasi belum dikonfigurasi</p>
          <p className="mt-2 text-fg-muted">
            Salin <code className="rounded bg-muted px-1 py-0.5 font-mono">.env.example</code>{" "}
            menjadi <code className="rounded bg-muted px-1 py-0.5 font-mono">.env</code>, lalu isi{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">APP_PASSWORD</code> dan{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">SESSION_SECRET</code>. Setelah
            itu jalankan ulang server pengembangan.
          </p>
        </div>
      )}

      <Disclaimer compact />
    </main>
  );
}
