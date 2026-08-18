"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import {
  LayoutDashboard,
  Filter,
  Star,
  BookOpen,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { MODE_LIST } from "@/lib/modes";
import type { InvestmentMode } from "@/lib/types";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/screener", label: "Screener", icon: Filter },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/alerts", label: "Alert", icon: Bell },
  { href: "/learn", label: "Belajar", icon: BookOpen },
];

export function Nav({
  activeMode,
  unreadAlerts,
}: {
  activeMode: InvestmentMode;
  unreadAlerts: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function changeMode(mode: InvestmentMode) {
    setModeOpen(false);
    await fetch("/api/settings/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    startTransition(() => router.refresh());
  }

  const current = MODE_LIST.find((m) => m.id === activeMode) ?? MODE_LIST[0];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded bg-accent font-mono text-sm font-bold text-accent-fg"
            aria-hidden="true"
          >
            II
          </span>
          <span className="hidden text-sm font-semibold sm:block">Investment Intelligence</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Navigasi utama">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "relative flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-surface-2 font-medium text-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg",
                )}
              >
                <Icon size={15} aria-hidden="true" />
                {link.label}
                {link.href === "/alerts" && unreadAlerts > 0 && (
                  <span
                    className="tnum ml-0.5 rounded-full bg-warn px-1.5 text-[10px] font-bold text-bg"
                    aria-label={`${unreadAlerts} alert belum dibaca`}
                  >
                    {unreadAlerts > 99 ? "99+" : unreadAlerts}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Pemilih Investment Mode — PRD §2: satu mode aktif, bisa diganti kapan saja */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setModeOpen((v) => !v)}
              aria-expanded={modeOpen}
              aria-haspopup="listbox"
              disabled={pending}
              className="flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-fg transition-colors hover:border-line-strong disabled:opacity-50"
            >
              <span className="text-fg-subtle">Mode</span>
              <span className="font-medium">{current.label}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>

            {modeOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-full z-50 mt-1 w-72 rounded border border-line-strong bg-surface p-1 shadow-xl"
              >
                {MODE_LIST.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    role="option"
                    aria-selected={mode.id === activeMode}
                    onClick={() => changeMode(mode.id)}
                    className={clsx(
                      "w-full cursor-pointer rounded px-3 py-2 text-left transition-colors hover:bg-surface-2",
                      mode.id === activeMode && "bg-surface-2",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {mode.label}
                      {mode.id === activeMode && (
                        <span className="text-[10px] font-normal text-accent">aktif</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{mode.tagline}</span>
                  </button>
                ))}
                <p className="border-t border-line px-3 py-2 text-xs text-fg-subtle">
                  Mode mengubah bobot 5 sub-skor. Skor lama tetap tersimpan per mode.
                </p>
              </div>
            )}
          </div>

          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="hidden cursor-pointer items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg sm:flex"
            >
              <LogOut size={14} aria-hidden="true" />
              Keluar
            </button>
          </form>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Tutup menu" : "Buka menu"}
            aria-expanded={open}
            className="cursor-pointer rounded border border-line p-2 md:hidden"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-line bg-surface md:hidden" aria-label="Navigasi mobile">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={clsx(
                  "flex min-h-11 items-center gap-2.5 border-b border-line px-4 py-3 text-sm",
                  isActive(link.href) ? "bg-surface-2 font-medium text-fg" : "text-fg-muted",
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {link.label}
                {link.href === "/alerts" && unreadAlerts > 0 && (
                  <span className="tnum ml-auto rounded-full bg-warn px-1.5 text-[10px] font-bold text-bg">
                    {unreadAlerts}
                  </span>
                )}
              </Link>
            );
          })}
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-left text-sm text-fg-muted"
            >
              <LogOut size={16} aria-hidden="true" />
              Keluar
            </button>
          </form>
        </nav>
      )}
    </header>
  );
}
