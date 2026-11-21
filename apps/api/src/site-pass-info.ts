/** What a site pass costs and how long one visit lasts, kept apart from site-pass.ts so the store's catalog can say so without a circular import. */
export function sitePassInfo(): { price: string; minutes: number } {
  // Shown to people and agents, so a value typed without the dollar sign ("0.25") still reads as a price.
  const raw = process.env.X402_SITE_PASS_PRICE?.trim() || "$0.25";
  return { price: /^\d/.test(raw) ? `$${raw}` : raw, minutes: Math.max(1, Math.floor(Number(process.env.X402_SITE_PASS_MINUTES)) || 60) };
}

/** A visit's length as a person would say it: "60 minutes", "3 hours", "30 days". */
export function passLength(minutes: number): string {
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  if (minutes < 120) return n(minutes, "minute");
  if (minutes < 2880 && minutes % 60 === 0) return n(minutes / 60, "hour");
  if (minutes % 1440 === 0) return n(minutes / 1440, "day");
  return n(Math.round(minutes / 60), "hour");
}

/**
 * The owner removed the site pass on 2026-11-21: AI crawlers read the website free and every item, books included, is
 * sold on its own. X402_SITE_PASS=on brings it back.
 */
export const sitePassEnabled = (): boolean => /^(on|true|1|yes)$/i.test(process.env.X402_SITE_PASS?.trim() ?? "");

/** A product description as shown: the sentences about the pass are dropped while there is no pass. */
export function shownDescription(text: string): string {
  if (sitePassEnabled()) return text;
  return text.replace(" Free with a site pass.", "").replace(" Needs a site pass first (the pass is the access), then each book costs extra.", " Each book is sold on its own.").replace(", even with a site pass", "");
}
