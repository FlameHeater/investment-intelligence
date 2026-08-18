"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { ASSET_TYPE_LABEL, type AssetType } from "@/lib/types";

interface Result {
  ticker: string;
  name: string;
  assetType: AssetType;
  sector: string | null;
}

export function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce 250ms: mengetik cepat tidak boleh memicu satu request per huruf.
  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/assets/search?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { results: Result[] };
        setResults(data.results ?? []);
        setHighlight(0);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(ticker: string) {
    setOpen(false);
    setQuery("");
    router.push(`/asset/${encodeURIComponent(ticker)}`);
  }

  return (
    <div ref={boxRef} className="relative w-full sm:w-80">
      <label htmlFor="asset-search" className="sr-only">
        Cari ticker atau nama aset
      </label>
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <input
          id="asset-search"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          aria-autocomplete="list"
          placeholder="Cari ticker atau nama (mis. BBCA, NVDA, BTC)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && results[highlight]) {
              e.preventDefault();
              go(results[highlight].ticker);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="h-10 w-full rounded border border-line bg-surface pl-9 pr-9 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-info"
        />
        {loading && (
          <Loader2
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-fg-subtle"
            aria-hidden="true"
          />
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded border border-line-strong bg-surface shadow-xl"
        >
          {results.map((r, i) => (
            <li key={r.ticker}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onClick={() => go(r.ticker)}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                  i === highlight ? "bg-surface-2" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-medium">{r.ticker}</span>
                  <span className="block truncate text-xs text-fg-subtle">{r.name}</span>
                </span>
                <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-fg-muted">
                  {ASSET_TYPE_LABEL[r.assetType]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && query.length > 0 && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded border border-line-strong bg-surface px-3 py-3 text-sm text-fg-muted">
          Tidak ada aset cocok di universe MVP. Universe sengaja dibatasi ~270 aset (lihat{" "}
          <code className="font-mono text-xs">src/lib/universe.ts</code>).
        </div>
      )}
    </div>
  );
}
