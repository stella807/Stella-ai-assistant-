import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insightsFor, noteSignal, recordSignal, summarizeSignals, type SignalsDb } from "../src/signals.ts";

const fakeStore = () => {
  const data: SignalsDb & { agentSales?: { payer?: string; amount: string; product?: string; at: string }[] } = {};
  return { data, update: (fn: (db: typeof data) => void) => fn(data) };
};
const D = (s: string) => new Date(s);

describe("payments that were tried", () => {
  it("counts how each attempt ended and how many different wallets tried, keeping only a short fingerprint of a wallet", () => {
    const s = fakeStore();
    const now = D("2026-11-22T12:00:00Z");
    const a = "0xAbC0000000000000000000000000000000000001", b = "0xdef0000000000000000000000000000000000002";
    recordSignal(s, now, { kind: "attempt", outcome: "invalid: insufficient_funds", wallet: a });
    recordSignal(s, now, { kind: "attempt", outcome: "Invalid: insufficient_funds", wallet: a.toLowerCase() });
    recordSignal(s, now, { kind: "attempt", outcome: "settled", wallet: b });
    recordSignal(s, now, { kind: "attempt", outcome: "unreadable" });
    const sum = summarizeSignals(s, now);
    expect(sum.payments).toEqual({ attempts: { "invalid: insufficient_funds": 2, settled: 1, unreadable: 1 }, wallets: 2 });
    expect(JSON.stringify(s.data)).not.toMatch(/0xabc|0xdef/i);
    expect(insightsFor(sum).join(" ")).toMatch(/4 payments tried by 2 different wallets; 3 did not settle/);
  });

  it("is quiet when nobody has tried to pay", () => {
    const sum = summarizeSignals(fakeStore(), D("2026-11-22T12:00:00Z"));
    expect(sum.payments).toEqual({ attempts: {}, wallets: 0 });
    expect(insightsFor(sum).join(" ")).not.toMatch(/payments? tried/);
  });
});

describe("recording what visitors do", () => {
  it("counts asks and payments per product and per crawler, by day", () => {
    const s = fakeStore();
    const now = D("2026-11-18T12:00:00Z");
    recordSignal(s, now, { kind: "ask", product: "site-pass", crawler: "gptbot" });
    recordSignal(s, now, { kind: "ask", product: "site-pass", crawler: "gptbot" });
    recordSignal(s, now, { kind: "ask", product: "site-pass", crawler: "claudebot" });
    recordSignal(s, now, { kind: "paid", product: "site-pass", crawler: "gptbot" });
    const sum = summarizeSignals(s, now);
    expect(sum.products["site-pass"]).toMatchObject({ asked: 3, paid: 1 });
    expect(sum.crawlers.find((c) => c.name === "gptbot")).toMatchObject({ asked: 2, paid: 1 });
    expect(sum.crawlers.find((c) => c.name === "claudebot")).toMatchObject({ asked: 1, paid: 0 });
  });

  it("keeps the most-searched words and the questions nobody could answer, ranked, lowercased and trimmed", () => {
    const s = fakeStore();
    const now = D("2026-11-18T12:00:00Z");
    for (let i = 0; i < 3; i++) recordSignal(s, now, { kind: "query", product: "vendors", text: "  Airport VIP  Puerto Rico " });
    recordSignal(s, now, { kind: "query", product: "vendors", text: "golf" });
    recordSignal(s, now, { kind: "unanswered", text: "Do you take Medicare?" });
    recordSignal(s, now, { kind: "unanswered", text: "do you take medicare?" });
    const sum = summarizeSignals(s, now);
    expect(sum.queries[0]).toEqual({ text: "airport vip puerto rico", count: 3 });
    expect(sum.unanswered[0]).toEqual({ text: "do you take medicare?", count: 2 });
  });

  it("stores no addresses and no names: only the words it was given, capped in length", () => {
    const s = fakeStore();
    recordSignal(s, D("2026-11-18T12:00:00Z"), { kind: "query", product: "facts", text: "x".repeat(500) });
    const stored = JSON.stringify(s.data);
    expect(stored.length).toBeLessThan(800);
    expect(Object.keys(s.data.signals!.days["2026-11-18"]!.queries!)[0]!.length).toBeLessThanOrEqual(100);
  });

  it("forgets days older than 90, and never lets a list of searches grow without limit", () => {
    const s = fakeStore();
    recordSignal(s, D("2026-06-01T12:00:00Z"), { kind: "ask", product: "vendors" });
    recordSignal(s, D("2026-11-18T12:00:00Z"), { kind: "ask", product: "vendors" });
    expect(Object.keys(s.data.signals!.days)).toEqual(["2026-11-18"]);
    for (let i = 0; i < 700; i++) recordSignal(s, D("2026-11-18T12:00:00Z"), { kind: "query", product: "vendors", text: `word ${i}` });
    expect(Object.keys(s.data.signals!.days["2026-11-18"]!.queries!).length).toBeLessThanOrEqual(500);
  });
});

describe("reading it back", () => {
  it("separates the last 7 days from the last 30", () => {
    const s = fakeStore();
    recordSignal(s, D("2026-11-01T12:00:00Z"), { kind: "ask", product: "vendors" });
    recordSignal(s, D("2026-11-17T12:00:00Z"), { kind: "ask", product: "vendors" });
    const sum = summarizeSignals(s, D("2026-11-18T12:00:00Z"));
    expect(sum.products.vendors).toMatchObject({ asked: 2 });
    expect(sum.last7.vendors).toMatchObject({ asked: 1 });
  });

  it("finds repeat buyers from the sales record", () => {
    const s = fakeStore();
    s.data.agentSales = [
      { payer: "0xA", amount: "10000", at: "2026-11-10T00:00:00Z" }, { payer: "0xa", amount: "10000", at: "2026-11-11T00:00:00Z" },
      { payer: "0xB", amount: "50000", at: "2026-11-12T00:00:00Z" },
    ];
    expect(summarizeSignals(s, D("2026-11-18T12:00:00Z")).buyers).toEqual({ total: 2, repeat: 1 });
  });

  it("counts the site chat box without keeping a word anyone typed", () => {
    const s = fakeStore();
    const now = D("2026-11-18T12:00:00Z");
    recordSignal(s, now, { kind: "chat", answered: true });
    recordSignal(s, now, { kind: "chat", answered: false });
    recordSignal(s, now, { kind: "chat", answered: false });
    expect(summarizeSignals(s, now).chat).toEqual({ asked: 3, handoff: 2 });
    expect(JSON.stringify(s.data)).not.toMatch(/medicare|question/i);
  });

  it("never shows more paid than asked, even for an agent that paid without asking first", () => {
    const s = fakeStore();
    const now = D("2026-11-18T12:00:00Z");
    recordSignal(s, now, { kind: "paid", product: "facts" });
    expect(summarizeSignals(s, now).products.facts).toEqual({ asked: 1, paid: 1 });
  });

  it("says plainly when there is too little to read anything into, and when people ask but do not pay", () => {
    const empty = summarizeSignals(fakeStore(), D("2026-11-18T12:00:00Z"));
    expect(insightsFor(empty).join(" ")).toMatch(/too little|not enough/i);
    const s = fakeStore();
    const now = D("2026-11-18T12:00:00Z");
    for (let i = 0; i < 12; i++) recordSignal(s, now, { kind: "ask", product: "site-pass", crawler: "gptbot" });
    expect(insightsFor(summarizeSignals(s, now)).join(" ")).toMatch(/site-pass.*nobody paid|asked 12.*paid 0/i);
  });
});

describe("counting must never slow the site down", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("counts in memory at once but saves the database once per half minute, not once per request", () => {
    const data: SignalsDb = {};
    let saves = 0;
    const store = { data, update: (fn: (db: SignalsDb) => void) => fn(data), save: () => { saves += 1; } };
    const now = new Date("2026-11-18T12:00:00Z");
    for (let i = 0; i < 500; i++) noteSignal(store, now, { kind: "ask", product: "site-pass", crawler: "gptbot" });
    expect(summarizeSignals(store, now).products["site-pass"]).toEqual({ asked: 500, paid: 0 });
    expect(saves).toBe(0);
    vi.advanceTimersByTime(31_000);
    expect(saves).toBe(1);
    noteSignal(store, now, { kind: "ask", product: "site-pass" });
    vi.advanceTimersByTime(31_000);
    expect(saves).toBe(2);
  });

  it("never throws into a sale or a page, even if saving fails", () => {
    const store = { data: {} as SignalsDb, update: () => { throw new Error("disk full"); }, save: () => { throw new Error("disk full"); } };
    expect(() => noteSignal(store, new Date(), { kind: "ask", product: "x" })).not.toThrow();
    expect(() => vi.advanceTimersByTime(31_000)).not.toThrow();
  });
});
