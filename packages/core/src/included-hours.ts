/**
 * The owner's setting for how many assistant hours each plan includes a
 * month. Unset means the plan's built-in number.
 *
 * Every reader of included hours goes through `includedConciergeHours`
 * (billing.ts), which asks here first, so changing a number moves the plan
 * card, the comparison table, the booking price and the profit calculator
 * together. Loaded per request like the monthly-freebies setting, because the
 * pricing functions have no handle on the store. No imports, so billing.ts can
 * read it.
 */
export const MAX_INCLUDED_HOURS = 500;

let live: Record<string, number> = {};

export const includedHoursOverride = (planId: string): number | undefined => live[planId];

export function setIncludedHours(config: unknown | null): void {
  const next: Record<string, number> = {};
  if (config && typeof config === "object") {
    for (const [id, v] of Object.entries(config as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_INCLUDED_HOURS) next[id] = v;
    }
  }
  live = next;
}
