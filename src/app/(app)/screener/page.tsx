import { ScreenerClient } from "./ScreenerClient";
import { getActiveMode } from "@/lib/settings";
import { MODES } from "@/lib/modes";
import { METRICS } from "@/lib/metrics";
import { aiEnabled } from "@/lib/ai/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Screener" };

export default async function ScreenerPage() {
  const mode = await getActiveMode();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Screener</h1>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">
          Menyaring universe berdasarkan field yang benar-benar ada datanya. Filter fundamental dan
          valuasi hanya berlaku untuk saham AS — saham IDX, kripto, dan emas tidak punya sumber data
          fundamental gratis yang bisa dipercaya, jadi mereka akan tersaring keluar alih-alih diberi
          angka karangan.
        </p>
      </div>

      <ScreenerClient
        mode={mode}
        modeLabel={MODES[mode].label}
        metrics={METRICS.map((m) => ({
          key: m.key,
          label: m.label,
          group: m.group,
          format: m.format,
          availableFor: m.availableFor,
          description: m.description,
        }))}
        aiAvailable={aiEnabled()}
      />
    </div>
  );
}
