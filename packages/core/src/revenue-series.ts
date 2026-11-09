import type { Charge } from "./wallet.ts";

export interface RevenueDay { day: string; cents: number }

/** Settled revenue per UTC day for the last `days` days ending today, zero-filled so a chart never skips a quiet day. */
export function revenueByDay(charges: readonly Charge[], now: Date, days = 30): RevenueDay[] {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 86_400_000;
  const series: RevenueDay[] = Array.from({ length: days }, (_, i) => ({
    day: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    cents: 0,
  }));
  const index = new Map(series.map((d, i) => [d.day, i]));
  for (const c of charges) {
    if (c.status !== "settled") continue;
    const at = (c.settledAt ?? c.createdAt).slice(0, 10);
    const i = index.get(at);
    if (i !== undefined) series[i]!.cents += c.amountCents;
  }
  return series;
}
