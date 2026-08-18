import { prisma } from "./db";
import { DEFAULT_MODE, isInvestmentMode } from "./modes";
import type { InvestmentMode } from "./types";

/**
 * Pengganti tabel USER_MODES multi-user dari PRD v1: satu baris key-value.
 * PRD §2 — di MVP, satu akun = satu mode aktif, bisa diganti kapan saja.
 */

const MODE_KEY = "investment_mode";

export async function getActiveMode(): Promise<InvestmentMode> {
  const row = await prisma.appSetting.findUnique({ where: { key: MODE_KEY } });
  return isInvestmentMode(row?.value) ? row.value : DEFAULT_MODE;
}

export async function setActiveMode(mode: InvestmentMode): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: MODE_KEY },
    create: { key: MODE_KEY, value: mode },
    update: { value: mode },
  });
}
