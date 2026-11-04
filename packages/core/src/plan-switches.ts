/**
 * The owner's on/off switches for the two entry plans, Free and Basic.
 *
 * Off hides a plan from everything that is *offered* — the catalog, the plan
 * picker, the pricing pages, checkout — and nobody new can join it. It is not
 * deleted: members already on it keep it, and Free is still what an account
 * with no paid plan falls back to, so check-ins and SOS never switch off.
 * Unset means the built-in behaviour (Free follows its `free-tier` flag,
 * Basic is offered).
 *
 * Loaded per request like the monthly-freebies setting, because the plan
 * functions have no handle on the store. No imports, so billing.ts can read it.
 */
export type SwitchablePlan = "free" | "basic";
export const SWITCHABLE_PLANS: SwitchablePlan[] = ["free", "basic"];

let live: Partial<Record<SwitchablePlan, boolean>> = {};

export const planSwitchFor = (id: string): boolean | undefined =>
  id === "free" || id === "basic" ? live[id] : undefined;

export function setPlanSwitches(config: unknown | null): void {
  const next: Partial<Record<SwitchablePlan, boolean>> = {};
  if (config && typeof config === "object") {
    for (const id of SWITCHABLE_PLANS) {
      const v = (config as Record<string, unknown>)[id];
      if (typeof v === "boolean") next[id] = v;
    }
  }
  live = next;
}
