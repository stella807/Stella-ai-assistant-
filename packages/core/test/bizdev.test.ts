import { describe, expect, it } from "vitest";
import {
  DEFAULT_BIZ_SETTINGS, bizStats, canMarkSent, draftFor, investorLists, isSuppressed, readBizSettings, readLeadInput, scoreLead, validateLead,
  type BizDraft, type BizLead,
} from "../src/bizdev.ts";

const NOW = new Date("2026-11-18T12:00:00Z");
const ISO = (d: string) => new Date(d).toISOString();

const lead = (over: Partial<BizLead> = {}): BizLead => ({
  id: "bl_1", kind: "investor", name: "Dana Rivera", org: "Isla Hospitality Partners", website: "https://isla.example",
  location: "San Juan, Puerto Rico", market: "puerto-rico", investorType: "family-office", stage: "seed",
  interests: ["hospitality", "transportation"], previousInvestments: ["A boutique hotel group"],
  typicalCheckUsd: { min: 500_000, max: 4_000_000 }, lastInvestmentOn: "2026-03-01",
  evidence: [
    { claim: "Invested in a Puerto Rico boutique hotel group", url: "https://isla.example/portfolio", tag: "hospitality", comparable: true },
    { claim: "Backed a chauffeur and transfers company", url: "https://isla.example/news", tag: "transportation", comparable: true },
  ],
  sources: ["https://isla.example/about"], status: "discovered", notes: "",
  createdAt: ISO("2026-11-10"), updatedAt: ISO("2026-11-10"), ...over,
});

const draft = (over: Partial<BizDraft> = {}): BizDraft => ({
  id: "bd_1", leadId: "bl_1", template: "investor", subject: "Safehubby", body: "Hello", status: "approved",
  followUp: 0, createdAt: ISO("2026-11-11"), approvedAt: ISO("2026-11-12"), ...over,
});

describe("scoring a lead", () => {
  it("scores a documented, recent, well-matched investor high, with every part explained", () => {
    const s = scoreLead(lead(), NOW);
    expect(s.total).toBeGreaterThanOrEqual(80);
    expect(s.total).toBeLessThanOrEqual(100);
    expect(Object.values(s.parts).reduce((a, b) => a + b, 0)).toBe(s.total);
    expect(s.qualified).toBe(true);
  });

  it("gives a lead with nothing documented a low score and says what is missing", () => {
    const s = scoreLead(lead({ evidence: [], typicalCheckUsd: undefined, lastInvestmentOn: undefined, interests: [], market: "international" }), NOW);
    expect(s.total).toBeLessThan(25);
    expect(s.qualified).toBe(false);
    expect(s.flags.join(" ")).toMatch(/check size/i);
    expect(s.flags.join(" ")).toMatch(/dated investment/i);
    expect(s.flags.join(" ")).toMatch(/evidence/i);
  });

  it("ignores evidence that has no https source, so a claim without a page behind it adds nothing", () => {
    const withUrl = scoreLead(lead(), NOW).total;
    const without = scoreLead(lead({ evidence: lead().evidence.map((e) => ({ ...e, url: "" })) }), NOW).total;
    expect(without).toBeLessThan(withUrl);
    const http = scoreLead(lead({ evidence: lead().evidence.map((e) => ({ ...e, url: "http://insecure.example" })) }), NOW).total;
    expect(http).toBe(without);
  });

  it("prefers the home market, then the other launch markets, then the rest of the US, then abroad", () => {
    const by = (market: BizLead["market"]) => scoreLead(lead({ market }), NOW).parts.geography;
    expect(by("puerto-rico")).toBeGreaterThan(by("texas"));
    expect(by("texas")).toBe(by("los-angeles"));
    expect(by("texas")).toBeGreaterThan(by("us"));
    expect(by("us")).toBeGreaterThan(by("international"));
  });

  it("does not mistake an investor's fund size for the cheque they write", () => {
    const s = scoreLead(lead({ typicalCheckUsd: undefined, fundSizeUsd: 900_000_000 }), NOW);
    expect(s.parts.size).toBeLessThanOrEqual(4);
    expect(s.flags.join(" ")).toMatch(/fund size is not a check size/i);
  });

  it("lets recent activity decay: an old last investment scores below a recent one", () => {
    const recent = scoreLead(lead({ lastInvestmentOn: "2026-06-01" }), NOW).parts.activity;
    const old = scoreLead(lead({ lastInvestmentOn: "2020-06-01" }), NOW).parts.activity;
    expect(recent).toBeGreaterThan(old);
  });

  it("scores customers and partners on documented fit and a listed way to reach them, not on cheque size", () => {
    const hotel = lead({ kind: "customer", investorType: undefined, typicalCheckUsd: undefined, lastInvestmentOn: undefined,
      evidence: [{ claim: "Advertises a 24/7 concierge desk", url: "https://hotel.example/services", tag: "concierge" }],
      contactChannel: { kind: "form", value: "https://hotel.example/contact", source: "https://hotel.example/contact" } });
    const s = scoreLead(hotel, NOW);
    expect(s.total).toBeGreaterThan(30);
    expect(s.parts.size).toBeUndefined();
  });
});

describe("the investor lists", () => {
  it("A: documented cheques that reach the full ask", () => {
    expect(investorLists(lead(), NOW)).toContain("A");
    expect(investorLists(lead({ typicalCheckUsd: { min: 50_000, max: 400_000 } }), NOW)).not.toContain("A");
  });
  it("B: cheques that fit a smaller Puerto Rico launch", () => {
    expect(investorLists(lead({ typicalCheckUsd: { min: 150_000, max: 600_000 } }), NOW)).toContain("B");
    expect(investorLists(lead({ typicalCheckUsd: { min: 150_000, max: 600_000 }, market: "texas" }), NOW)).not.toContain("B");
  });
  it("C, D, E and F come from documented evidence and type, never from a guess", () => {
    expect(investorLists(lead({ investorType: "fleet-financing" }), NOW)).toContain("C");
    expect(investorLists(lead({ evidence: [{ claim: "Funds consumer growth", url: "https://x.example/a", tag: "marketing" }] }), NOW)).toContain("D");
    expect(investorLists(lead({ investorType: "strategic-hospitality", typicalCheckUsd: undefined }), NOW)).toContain("E");
    expect(investorLists(lead({ evidence: [{ claim: "Runs an angel network", url: "https://x.example/b", tag: "introductions" }] }), NOW)).toContain("F");
    const bare = investorLists(lead({ evidence: [], investorType: "angel", typicalCheckUsd: undefined }), NOW);
    expect(bare).toEqual([]);
  });
});

describe("checking a lead before it is saved", () => {
  const ok = { name: "Dana Rivera", kind: "investor", investorType: "angel", market: "puerto-rico", sources: ["https://isla.example/about"] };
  it("needs a name, a kind and at least one https source", () => {
    expect(validateLead(ok)).toEqual([]);
    expect(validateLead({ ...ok, name: " " }).join(" ")).toMatch(/name/i);
    expect(validateLead({ ...ok, sources: [] }).join(" ")).toMatch(/source/i);
    expect(validateLead({ ...ok, sources: ["http://plain.example"] }).join(" ")).toMatch(/https/i);
    expect(validateLead({ ...ok, kind: "friend" }).join(" ")).toMatch(/kind/i);
  });
  it("needs an investor type for an investor", () => {
    expect(validateLead({ ...ok, investorType: undefined }).join(" ")).toMatch(/investor type/i);
  });
  it("never accepts an email address without the page it was read on", () => {
    expect(validateLead({ ...ok, contactChannel: { kind: "email", value: "dana@isla.example" } }).join(" ")).toMatch(/source/i);
    expect(validateLead({ ...ok, contactChannel: { kind: "email", value: "dana@isla.example", source: "https://isla.example/contact" } })).toEqual([]);
    expect(validateLead({ ...ok, contactChannel: { kind: "email", value: "not-an-email", source: "https://isla.example/contact" } }).join(" ")).toMatch(/email/i);
  });
  it("rejects a cheque range that runs backwards", () => {
    expect(validateLead({ ...ok, typicalCheckUsd: { min: 900, max: 100 } }).join(" ")).toMatch(/check/i);
  });
});

describe("drafting a message", () => {
  it("uses only facts on the lead, and leaves out what it does not know", () => {
    const d = draftFor(lead({ evidence: [] }), "investor", NOW);
    expect(d.body).toContain("Dana Rivera");
    expect(d.body).not.toMatch(/undefined|null|\{\{/);
    expect(d.body).not.toMatch(/portfolio/i);
  });
  it("cites one documented reason when there is one", () => {
    expect(draftFor(lead(), "investor", NOW).body).toContain("Invested in a Puerto Rico boutique hotel group");
  });
  it("says the company has no revenue, promises no return and is no offer of securities", () => {
    const b = draftFor(lead(), "investor", NOW).body;
    expect(b).toMatch(/no revenue/i);
    expect(b).toMatch(/not an offer/i);
    expect(b).not.toMatch(/guarante|return of|%\s*return|ROI/i);
    expect(b).toMatch(/contact@safehubby\.com/);
  });
  it("offers a way to stop the messages", () => {
    expect(draftFor(lead({ kind: "customer" }), "hotel", NOW).body).toMatch(/reply "no"|won't write again/i);
  });
  it("has a template for every kind of recipient", () => {
    for (const t of ["investor", "family-office", "fleet-financing", "hotel", "corporate", "security-partner", "strategic-partner"] as const) {
      const d = draftFor(lead(), t, NOW);
      expect(d.subject.length, t).toBeGreaterThan(5);
      expect(d.body.length, t).toBeGreaterThan(150);
    }
  });
});

describe("what may be marked as sent", () => {
  const settings = { ...DEFAULT_BIZ_SETTINGS, securitiesReviewed: true };
  const check = (over: { d?: Partial<BizDraft>; l?: Partial<BizLead>; sup?: { value: string }[]; prior?: BizDraft[]; s?: Partial<typeof settings> } = {}) =>
    canMarkSent(draft(over.d), lead(over.l), { ...settings, ...over.s }, over.sup ?? [], over.prior ?? [], NOW);

  it("allows an approved message to a lead who has not opted out", () => {
    expect(check()).toEqual({ ok: true, reasons: [] });
  });
  it("blocks a message nobody approved", () => {
    expect(check({ d: { status: "draft", approvedAt: undefined } }).ok).toBe(false);
  });
  it("blocks a lead on the suppression list, by address or by domain", () => {
    const l = { contactChannel: { kind: "email" as const, value: "dana@isla.example", source: "https://isla.example/contact" } };
    expect(check({ l, sup: [{ value: "dana@isla.example" }] }).reasons.join(" ")).toMatch(/opted out|suppress/i);
    expect(check({ l, sup: [{ value: "isla.example" }] }).ok).toBe(false);
    expect(check({ l, sup: [{ value: "other.example" }] }).ok).toBe(true);
  });
  it("keeps investor messages blocked until the owner says counsel has reviewed how they are approached", () => {
    expect(check({ s: { securitiesReviewed: false } }).reasons.join(" ")).toMatch(/securities|counsel|attorney/i);
    expect(check({ l: { kind: "customer" }, d: { template: "hotel" }, s: { securitiesReviewed: false } }).ok).toBe(true);
  });
  it("stops after two follow-ups and spaces messages at least five days apart", () => {
    const sent = (daysAgo: number, n: number): BizDraft => draft({ id: `p${n}`, status: "sent", followUp: n, sentAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString() });
    expect(check({ prior: [sent(30, 0), sent(20, 1), sent(10, 2)] }).reasons.join(" ")).toMatch(/follow-up/i);
    expect(check({ prior: [sent(2, 0)] }).reasons.join(" ")).toMatch(/days/i);
    expect(check({ prior: [sent(8, 0)] }).ok).toBe(true);
  });
  it("blocks a lead that said no or was turned down", () => {
    expect(check({ l: { status: "rejected" } }).ok).toBe(false);
  });
  it("matches a suppression however it was typed", () => {
    const l = lead({ contactChannel: { kind: "email", value: "Dana@Isla.Example", source: "https://isla.example/c" } });
    expect(isSuppressed(l, [{ value: " dana@isla.example " }])).toBe(true);
    expect(isSuppressed(l, [{ value: "@isla.example" }])).toBe(true);
  });
});

describe("the owner's summary", () => {
  it("counts leads by kind and status, and adds up only documented cheque sizes of qualified investors", () => {
    const leads = [
      lead({ id: "a" }),
      lead({ id: "b", typicalCheckUsd: { min: 100_000, max: 600_000 } }),
      lead({ id: "c", evidence: [], typicalCheckUsd: { min: 1_000_000, max: 9_000_000 } }),
      lead({ id: "d", kind: "customer", investorType: undefined, status: "sent" }),
    ];
    const s = bizStats(leads, [draft({ status: "draft" }), draft({ id: "x", status: "sent" })], NOW);
    expect(s.byKind.investor).toBe(3);
    expect(s.byKind.customer).toBe(1);
    expect(s.qualifiedInvestors).toBe(2);
    expect(s.documentedFundingUsd).toBe(4_600_000);
    expect(s.draftsAwaitingApproval).toBe(1);
    expect(s.messagesSent).toBe(1);
    expect(s.fundingNote).toMatch(/not commitments/i);
  });
});

describe("reading what the portal sends", () => {
  it("keeps only the fields sent, trimmed, and turns typed lists and amounts into data", () => {
    const got = readLeadInput({ name: "  Ana  ", interests: "hotels, transport ,", typicalCheckUsd: { min: "$250,000", max: "" }, lastInvestmentOn: "2025-13-40", extra: "x" });
    expect(got).toEqual({ name: "Ana", interests: ["hotels", "transport"], typicalCheckUsd: { min: 250_000, max: undefined }, lastInvestmentOn: undefined });
  });
  it("drops an evidence tag it does not know and a contact with no value", () => {
    const got = readLeadInput({ evidence: [{ claim: "A", url: "https://a.example", tag: "nonsense", comparable: "yes" }], contactChannel: { kind: "email", value: " " } });
    expect(got.evidence).toEqual([{ claim: "A", url: "https://a.example" }]);
    expect(got.contactChannel).toBeUndefined();
  });
  it("refuses a website that is not https and evidence without a claim", () => {
    const base = lead();
    expect(validateLead({ ...base, website: "http://isla.example" }).join(" ")).toMatch(/website/i);
    expect(validateLead({ ...base, evidence: [{ claim: " ", url: "https://isla.example/x" }] }).join(" ")).toMatch(/sentence/i);
    expect(validateLead({ ...base, status: "maybe" }).join(" ")).toMatch(/status/i);
  });
  it("keeps the sending limits inside the rules, however the settings are typed", () => {
    const s = readBizSettings({ minDaysBetween: 1, maxFollowUps: 9, securitiesReviewed: "true", askUsd: "3,800,000" });
    expect(s.minDaysBetween).toBe(5);
    expect(s.maxFollowUps).toBe(2);
    expect(s.securitiesReviewed).toBe(false);
    expect(s.askUsd).toBe(3_800_000);
    expect(readBizSettings({ securitiesReviewed: true }).securitiesReviewed).toBe(true);
  });
});

describe("the securities hold and the opt-out list, edge cases", () => {
  it("holds any message to an investor, whatever template it was drafted from", () => {
    const r = canMarkSent(draft({ template: "hotel" }), lead(), DEFAULT_BIZ_SETTINGS, [], [], NOW);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/counsel/i);
    expect(canMarkSent(draft({ template: "hotel" }), lead({ kind: "partner" }), DEFAULT_BIZ_SETTINGS, [], [], NOW).ok).toBe(true);
  });
  it("lets a suppressed domain cover its subdomains, but not a lookalike", () => {
    const l = lead({ website: "https://invest.isla.example", contactChannel: { kind: "email", value: "dana@mail.isla.example", source: "https://isla.example/c" } });
    expect(isSuppressed(l, [{ value: "isla.example" }])).toBe(true);
    expect(isSuppressed(lead({ website: "https://notisla.example" }), [{ value: "isla.example" }])).toBe(false);
  });
  it("greets the named contact when there is one", () => {
    expect(draftFor(lead({ contactName: "Ana Ortiz" }), "investor", NOW).body.startsWith("Hello Ana Ortiz,")).toBe(true);
  });
});
