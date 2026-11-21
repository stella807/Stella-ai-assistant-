/**
 * The spending check: before an agent pays for something, it sends its person's spending rule and the purchase it is
 * about to make, and gets back allow, ask_person or deny, with the reasons. Pure logic: nothing is fetched or kept.
 * The rule's shape is the one printed in the book "Building for Agents".
 */
export type SpendDecision = { decision: "allow" | "ask_person" | "deny"; reasons: string[]; leftTodayUsd: number | null };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()) : []);
const money = (n: number) => Math.round(n * 1e6) / 1e6;

export function checkSpend(rawRule: unknown, rawPurchase: unknown): SpendDecision | { error: string } {
  if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) return { error: "rule must be a JSON object, for example {\"max_per_request_usd\":0.25,\"max_per_day_usd\":2,\"allowed\":[\"live answers\"]}." };
  if (!rawPurchase || typeof rawPurchase !== "object" || Array.isArray(rawPurchase)) return { error: "purchase must be a JSON object with item, price_usd and spent_today_usd." };
  const rule = rawRule as Record<string, unknown>, p = rawPurchase as Record<string, unknown>;
  const price = num(p.price_usd), spent = num(p.spent_today_usd) ?? 0;
  const item = typeof p.item === "string" ? p.item.trim().toLowerCase().slice(0, 120) : "";
  if (price === undefined || price < 0 || spent < 0) return { error: "price_usd (and spent_today_usd, if given) must be numbers of 0 or more." };
  if (!item) return { error: "purchase.item must say what is being bought." };

  const perRequest = num(rule.max_per_request_usd), perDay = num(rule.max_per_day_usd);
  const allowed = list(rule.allowed), askFirst = list(rule.ask_first_for);
  const deny: string[] = [], ask: string[] = [];
  const leftTodayUsd = perDay === undefined ? null : money(Math.max(0, perDay - spent - price));

  // No cap is not permission: a person who never set a limit has not agreed to any spending.
  if (perRequest === undefined && perDay === undefined) ask.push("The rule sets no spending cap, so no purchase is pre-approved.");
  if (perRequest !== undefined && price > perRequest) deny.push(`The price $${price} is over the per-request cap of $${perRequest}.`);
  if (perDay !== undefined && spent + price > perDay) ask.push(`This would bring today's spending to $${money(spent + price)}, over the daily cap of $${perDay}.`);
  if (allowed.length && !allowed.includes(item)) ask.push(`"${item}" is not on the allowed list.`);
  if (p.seen_before === false && (askFirst.includes("anything new") || askFirst.length === 0)) ask.push("This is a new kind of purchase; the rule asks the person first.");

  const retry = p.retry && typeof p.retry === "object" ? (p.retry as Record<string, unknown>) : undefined;
  if (retry) {
    const count = num(retry.count) ?? 1, allowedRetries = num(rule.retry_if_source_down) ?? 0;
    if (retry.because !== "source_down") ask.push("A retry for any reason other than the source being down needs the person.");
    else if (count > allowedRetries) ask.push(`Retry ${count} is over the ${allowedRetries} the rule allows when a source is down.`);
  }

  if (deny.length) return { decision: "deny", reasons: [...deny, ...ask], leftTodayUsd };
  if (ask.length) return { decision: "ask_person", reasons: ask, leftTodayUsd };
  return { decision: "allow", reasons: ["Within the per-request and daily caps, on the allowed list, and of a kind already approved."], leftTodayUsd };
}
