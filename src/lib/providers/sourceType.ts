import type { SourceType } from "../types";

/**
 * PRD §5 poin 7: Source Verification badge dengan ATURAN STATIS, bukan model
 * klasifikasi.
 *
 * Daftar ini sengaja dibuat eksplisit dan mudah diaudit. Kalau sebuah sumber
 * tidak dikenali, defaultnya `media` — bukan `official`. Menaikkan sesuatu yang
 * tidak dikenal menjadi "Resmi" jauh lebih berbahaya daripada menurunkan sumber
 * kredibel menjadi "Media", karena label Resmi-lah yang membuat pembaca berhenti
 * memverifikasi.
 */

/** Penerbit primer: bursa, regulator, atau perusahaan itu sendiri. */
const OFFICIAL_PATTERNS = [
  // Amerika Serikat
  "sec.gov",
  "sec filing",
  "company press release",
  "businesswire",
  "globenewswire",
  "prnewswire",
  "accesswire",
  "federal reserve",
  // Indonesia
  "idx.co.id",
  "bursa efek indonesia",
  "keterbukaan informasi",
  "bank indonesia",
  "ojk",
  "kemenkeu",
  "bps.go.id",
  "antaranews",
  "antara news",
];

/**
 * Sumber opini, agregator, atau kanal tanpa proses editorial yang jelas.
 * Bobotnya dikecilkan di sentimentScore().
 */
const SOCIAL_PATTERNS = [
  "reddit",
  "twitter",
  "x.com",
  "stocktwits",
  "seekingalpha",
  "motley fool",
  "fool.com",
  "investorplace",
  "zacks",
  "benzinga",
  "medium",
  "substack",
  "blogspot",
  "wordpress.com",
  "kaskus",
  "tradingview",
  "youtube",
  "tiktok",
];

export function classifySource(source: string): SourceType {
  const s = source.toLowerCase();
  if (OFFICIAL_PATTERNS.some((p) => s.includes(p))) return "official";
  if (SOCIAL_PATTERNS.some((p) => s.includes(p))) return "social_unverified";
  return "media";
}
