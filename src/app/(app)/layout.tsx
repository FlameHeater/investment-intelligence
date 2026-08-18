import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Disclaimer } from "@/components/ui";
import { isAuthenticated } from "@/lib/auth";
import { getActiveMode } from "@/lib/settings";
import { prisma } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Middleware sudah memeriksa, tapi diperiksa ulang di sini: middleware bisa
  // dilewati kalau matcher berubah, sedangkan lapisan ini selalu jalan.
  if (!(await isAuthenticated())) redirect("/login");

  const [mode, unreadAlerts] = await Promise.all([
    getActiveMode(),
    prisma.alertEvent.count({ where: { readAt: null } }).catch(() => 0),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav activeMode={mode} unreadAlerts={unreadAlerts} />

      <main id="konten" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">
        {children}
      </main>

      <footer className="mx-auto w-full max-w-[1600px] space-y-3 px-4 pb-8 pt-4">
        <Disclaimer />
        <p className="text-center text-xs text-fg-subtle">
          Investment Intelligence — alat bantu keputusan personal, bukan broker dan bukan penasihat
          keuangan. Semua skor adalah penilaian analitis atas data historis dan publik.
        </p>
      </footer>
    </div>
  );
}
