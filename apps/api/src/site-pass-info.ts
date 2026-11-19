/** What a site pass costs and how long one visit lasts, kept apart from site-pass.ts so the store's catalog can say so without a circular import. */
export function sitePassInfo(): { price: string; minutes: number } {
  return { price: process.env.X402_SITE_PASS_PRICE?.trim() || "$8.99", minutes: Math.max(1, Math.floor(Number(process.env.X402_SITE_PASS_MINUTES)) || 60) };
}

/** A visit's length as a person would say it: "60 minutes", "3 hours", "30 days". */
export function passLength(minutes: number): string {
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  if (minutes < 120) return n(minutes, "minute");
  if (minutes < 2880 && minutes % 60 === 0) return n(minutes / 60, "hour");
  if (minutes % 1440 === 0) return n(minutes / 1440, "day");
  return n(Math.round(minutes / 60), "hour");
}
