/** What the site pass costs and lasts, kept apart from site-pass.ts so the store's catalog can say so without a circular import. */
export function sitePassInfo(): { price: string; days: number } {
  return { price: process.env.X402_SITE_PASS_PRICE?.trim() || "$8.99", days: Math.max(1, Number(process.env.X402_SITE_PASS_DAYS) || 30) };
}
