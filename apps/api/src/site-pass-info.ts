/** What a site pass costs and how long one visit lasts, kept apart from site-pass.ts so the store's catalog can say so without a circular import. */
export function sitePassInfo(): { price: string; minutes: number } {
  return { price: process.env.X402_SITE_PASS_PRICE?.trim() || "$8.99", minutes: Math.max(1, Math.floor(Number(process.env.X402_SITE_PASS_MINUTES)) || 60) };
}
