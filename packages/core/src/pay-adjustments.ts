/**
 * Live adjustments to what the people doing the work are paid, set by the
 * owner from the master portal.
 *
 * Held as *differences* from the built-in rates rather than new absolute
 * rates, for one reason: when the owner gives a personal assistant a raise,
 * the customer price moves by the same amount, so Safehubby's cut per hour
 * stays what it was instead of quietly shrinking. Like the monthly-freebies
 * setting, this is loaded per request because the pricing functions have no
 * handle on the store. No imports, so every pricing module can read it.
 */
export interface PayDeltas {
  /** Change to the personal assistant's hourly pay, in cents. */
  paHourly: number;
  /** Change to the hospital-day pay, in cents. */
  hospitalDay: number;
  /** Change to what an errand pays the runner, in cents. */
  errand: number;
}

const NONE: PayDeltas = { paHourly: 0, hospitalDay: 0, errand: 0 };
let live: PayDeltas = NONE;

export const payDeltas = (): PayDeltas => live;

export function setPayDeltas(next: Partial<PayDeltas> | null): void {
  const whole = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0);
  live = next ? { paHourly: whole(next.paHourly), hospitalDay: whole(next.hospitalDay), errand: whole(next.errand) } : NONE;
}
