/**
 * Signals: counts of what visitors do, kept to learn what to change. High signal means money or action, not opinion:
 * how many times each paid thing was asked for and how many times it was paid for, which named crawlers come, what is
 * searched for, and what nobody could answer.
 *
 * Private by design. Nothing here is an address, a browser string or a person: only counts, the name of a known crawler
 * (like "gptbot"), and the words that were searched for, trimmed and capped. Days older than 90 are forgotten.
 */

import { createHash } from "node:crypto";

export interface DayCounts {
  products?: Record<string, { asked: number; paid: number }>;
  crawlers?: Record<string, { asked: number; paid: number }>;
  queries?: Record<string, number>;
  unanswered?: Record<string, number>;
  /** The site chat box: how many questions, and how many it sent to a person. The words typed are never kept. */
  chat?: { asked: number; handoff: number };
  /** Payments that were actually tried (a payment header arrived), by how each ended. */
  attempts?: Record<string, number>;
  /** A short fingerprint of each wallet that tried (up to 200 a day), so a count of different wallets is possible. */
  attemptWallets?: string[];
}
export interface SignalsDb { signals?: { days: Record<string, DayCounts> } }

export type SignalEvent =
  | { kind: "ask" | "paid"; product: string; crawler?: string }
  | { kind: "query"; product: string; text: string }
  | { kind: "unanswered"; text: string }
  | { kind: "chat"; answered: boolean }
  /** A payment header arrived. outcome is "settled", "unreadable", "mismatch", "invalid: <reason>", "settle-failed: <reason>" or "facilitator-error". */
  | { kind: "attempt"; outcome: string; wallet?: string };

interface StoreLike<T> { data: T; update(fn: (db: T) => void): void; save?(): void }

const MAX_TEXT = 100;
const MAX_KEYS = 200;
const KEEP_DAYS = 90;
const day = (d: Date) => d.toISOString().slice(0, 10);
const fingerprint = (wallet: string) => createHash("sha256").update(wallet.toLowerCase()).digest("hex").slice(0, 10);
const clean = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);

function bump(map: Record<string, number>, key: string) {
  if (!(key in map) && Object.keys(map).length >= MAX_KEYS) return; // a full list ignores new words rather than growing
  map[key] = (map[key] ?? 0) + 1;
}
function bumpPair(map: Record<string, { asked: number; paid: number }>, key: string, field: "asked" | "paid") {
  const row = (map[key] ??= { asked: 0, paid: 0 });
  row[field] += 1;
}

export function recordSignal<T extends SignalsDb>(store: StoreLike<T>, now: Date, e: SignalEvent): void {
  store.update((db) => apply(db, now, e));
}

function apply(db: SignalsDb, now: Date, e: SignalEvent): void {
  const all = (db.signals ??= { days: {} });
  const cutoff = day(new Date(now.getTime() - KEEP_DAYS * 86_400_000));
  for (const k of Object.keys(all.days)) if (k < cutoff) delete all.days[k];
  const d = (all.days[day(now)] ??= {});
  if (e.kind === "ask" || e.kind === "paid") {
    const field = e.kind === "ask" ? "asked" : "paid";
    bumpPair((d.products ??= {}), e.product, field);
    if (e.crawler) bumpPair((d.crawlers ??= {}), e.crawler.toLowerCase().slice(0, 40), field);
  } else if (e.kind === "chat") {
    const c = (d.chat ??= { asked: 0, handoff: 0 });
    c.asked += 1;
    if (!e.answered) c.handoff += 1;
  } else if (e.kind === "attempt") {
    bump((d.attempts ??= {}), clean(e.outcome) || "unknown");
    if (e.wallet) {
      const f = fingerprint(e.wallet);
      const list = (d.attemptWallets ??= []);
      if (!list.includes(f) && list.length < 200) list.push(f);
    }
  } else if (e.kind === "query") {
    const t = clean(e.text);
    if (t) bump((d.queries ??= {}), t);
  } else if (e.kind === "unanswered") {
    const t = clean(e.text);
    if (t) bump((d.unanswered ??= {}), t);
  }
}

const FLUSH_MS = 30_000;
const flushing = new WeakSet<object>();

/**
 * For traffic anyone can cause (a crawler fetching page after page). It counts in memory at once and saves the database at
 * most once per half minute: saving on every request would let one crawler slow the whole site. A crash loses at most half
 * a minute of counts. A failure here must never cost a sale or break a page, so it is swallowed.
 */
export function noteSignal<T extends SignalsDb>(store: StoreLike<T>, now: Date, e: SignalEvent): void {
  try {
    apply(store.data, now, e);
    if (!store.save || flushing.has(store)) return;
    flushing.add(store);
    const timer = setTimeout(() => {
      flushing.delete(store);
      try { store.save?.(); } catch { /* the next count schedules another save */ }
    }, FLUSH_MS);
    timer.unref?.();
  } catch { /* counting is best effort */ }
}

export interface SignalsSummary {
  /** Last 30 days. */
  products: Record<string, { asked: number; paid: number }>;
  last7: Record<string, { asked: number; paid: number }>;
  crawlers: { name: string; asked: number; paid: number }[];
  queries: { text: string; count: number }[];
  unanswered: { text: string; count: number }[];
  buyers: { total: number; repeat: number };
  chat: { asked: number; handoff: number };
  /** Last 30 days: payments that were actually tried, by how each ended, and how many different wallets tried. */
  payments: { attempts: Record<string, number>; wallets: number };
}

type SalesDb = { agentSales?: { payer?: string }[] };

export function summarizeSignals<T extends SignalsDb & SalesDb>(store: { data: T }, now: Date): SignalsSummary {
  const days = store.data.signals?.days ?? {};
  const from30 = day(new Date(now.getTime() - 29 * 86_400_000));
  const from7 = day(new Date(now.getTime() - 6 * 86_400_000));
  const products: SignalsSummary["products"] = {};
  const last7: SignalsSummary["products"] = {};
  const crawlers: Record<string, { asked: number; paid: number }> = {};
  const queries: Record<string, number> = {};
  const unanswered: Record<string, number> = {};
  const chat = { asked: 0, handoff: 0 };
  const attempts: Record<string, number> = {};
  const wallets = new Set<string>();
  for (const [k, d] of Object.entries(days)) {
    if (k < from30 || k > day(now)) continue;
    for (const [o, n] of Object.entries(d.attempts ?? {})) attempts[o] = (attempts[o] ?? 0) + n;
    for (const w of d.attemptWallets ?? []) wallets.add(w);
    for (const [p, c] of Object.entries(d.products ?? {})) {
      const t = (products[p] ??= { asked: 0, paid: 0 }); t.asked += c.asked; t.paid += c.paid;
      if (k >= from7) { const w = (last7[p] ??= { asked: 0, paid: 0 }); w.asked += c.asked; w.paid += c.paid; }
    }
    chat.asked += d.chat?.asked ?? 0; chat.handoff += d.chat?.handoff ?? 0;
    for (const [n, c] of Object.entries(d.crawlers ?? {})) { const t = (crawlers[n] ??= { asked: 0, paid: 0 }); t.asked += c.asked; t.paid += c.paid; }
    for (const [q, n] of Object.entries(d.queries ?? {})) queries[q] = (queries[q] ?? 0) + n;
    for (const [q, n] of Object.entries(d.unanswered ?? {})) unanswered[q] = (unanswered[q] ?? 0) + n;
  }
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([text, count]) => ({ text, count }));
  const byPayer = new Map<string, number>();
  for (const s of store.data.agentSales ?? []) if (s.payer) byPayer.set(s.payer.toLowerCase(), (byPayer.get(s.payer.toLowerCase()) ?? 0) + 1);
  // An agent that pays without asking first has paid for something it was never shown the price of; count that as asked.
  const atLeastPaid = (m: Record<string, { asked: number; paid: number }>) => { for (const c of Object.values(m)) c.asked = Math.max(c.asked, c.paid); };
  atLeastPaid(products); atLeastPaid(last7); atLeastPaid(crawlers);
  return {
    products, last7, chat, payments: { attempts, wallets: wallets.size },
    crawlers: Object.entries(crawlers).map(([name, c]) => ({ name, ...c })).sort((a, b) => b.asked - a.asked || a.name.localeCompare(b.name)).slice(0, 15),
    queries: top(queries), unanswered: top(unanswered),
    buyers: { total: byPayer.size, repeat: [...byPayer.values()].filter((n) => n > 1).length },
  };
}

/** Plain sentences about what the numbers do and do not say, with a guard against reading too much into very little. */
export function insightsFor(s: SignalsSummary): string[] {
  const out: string[] = [];
  const asked = Object.values(s.products).reduce((a, p) => a + p.asked, 0);
  if (asked < 10) out.push("Too little so far to read anything into. Come back when a few dozen requests have been counted.");
  for (const [name, p] of Object.entries(s.products)) {
    if (p.asked >= 10 && p.paid === 0) out.push(`${name}: asked ${p.asked} times and paid 0. Nobody paid yet: the price may be too high, or the ones asking cannot pay.`);
    else if (p.asked >= 10) out.push(`${name}: asked ${p.asked} times, paid ${p.paid} (${Math.round((p.paid / p.asked) * 100)}%).`);
  }
  if (s.chat.asked >= 5) out.push(`The chat box was asked ${s.chat.asked} questions and sent ${s.chat.handoff} to a person (${Math.round((s.chat.handoff / s.chat.asked) * 100)}%).`);
  if (s.unanswered.length) out.push(`The most common question with no answer: "${s.unanswered[0]!.text}" (${s.unanswered[0]!.count}x). Each one is a missing fact.`);
  const tried = Object.values(s.payments.attempts).reduce((a, n) => a + n, 0);
  const failed = tried - (s.payments.attempts["settled"] ?? 0);
  if (tried > 0) out.push(`${tried} payment${tried === 1 ? "" : "s"} tried by ${s.payments.wallets} different wallet${s.payments.wallets === 1 ? "" : "s"}; ${failed} did not settle. ${failed ? "Read the reasons: a rejected payment is a wallet or network problem, not a lack of interest." : ""}`.trim());
  if (s.buyers.total > 0) out.push(`${s.buyers.total} different buyer${s.buyers.total === 1 ? "" : "s"}, ${s.buyers.repeat} that came back.`);
  return out;
}
