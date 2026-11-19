import { describe, expect, it } from "vitest";
import { checkRequest } from "../src/request-check.ts";
import { noticesSince, seasonOn } from "../src/notices.ts";
import { buildApprovalPack } from "../src/approval-pack.ts";

const good = {
  task: "Pick up the prescription for Garcia at the pharmacy on Main Street",
  needed_by: "2026-12-03 17:00, firm",
  from: "Pharmacy on Main Street", to: "Front desk of the building, ask for Rosa",
  spend_cap: "$15 including fees", if_unavailable: "call_me", proof_wanted: "photo of the bag and the receipt",
  contact: "the family, by message, answers within ten minutes", private_details_shared: "none",
};

describe("the request check", () => {
  it("passes a complete request and hands back plain text to send", () => {
    const r: any = checkRequest(good);
    expect(r).toMatchObject({ readyToSend: true, missing: [], stopSigns: [], askPersonFirst: [] });
    expect(r.forPerson).toContain("Spend no more than $15 including fees");
  });

  it("lists what is missing, and accepts the field names the books use", () => {
    const r: any = checkRequest({ what: good.task, where_from: good.from });
    expect(r.readyToSend).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(["needed_by", "to", "spend_cap", "if_unavailable", "proof_wanted", "contact"]));
    expect(r.missing).not.toContain("task");
    expect(r.missing).not.toContain("from");
    expect((checkRequest({ ...good, task: undefined, what: good.task, from: undefined, where_from: good.from, proof_wanted: undefined, confirm_with: "receipt" }) as any).missing).toEqual([]);
  });

  it("stops on ways of paying that cannot be undone and on asking for secrets", () => {
    for (const bad of ["pay the helper in gift cards", "send bitcoin to the helper", "pay by Zelle to his personal account", "give the helper the card number and the PIN", "send my bank login", "do not tell my daughter"]) {
      const r: any = checkRequest({ ...good, contact: bad });
      expect(r.stopSigns.length, bad).toBeGreaterThan(0);
      expect(r.readyToSend, bad).toBe(false);
    }
    expect((checkRequest({ ...good, spend_cap: "no limit" }) as any).stopSigns.join(" ")).toMatch(/cap/i);
  });

  it("says the person must approve before a key, a door code, or a health detail is shared", () => {
    const r: any = checkRequest({ ...good, private_details_shared: "door code 4821 and her diagnosis" });
    expect(r.askPersonFirst.join(" ")).toMatch(/home|door/i);
    expect(r.askPersonFirst.join(" ")).toMatch(/health/i);
    expect(r.readyToSend).toBe(false);
  });

  it("warns about a vague task, a cap with no number, and an unclear fallback", () => {
    const r: any = checkRequest({ ...good, task: "get some stuff", spend_cap: "cheap", if_unavailable: "whatever" });
    expect(r.warnings.join(" ")).toMatch(/vague/i);
    expect(r.warnings.join(" ")).toMatch(/number/i);
    expect(r.warnings.join(" ")).toMatch(/substitute|call|skip/i);
  });

  it("refuses what it cannot read, and a request that is far too long", () => {
    expect(checkRequest("nope")).toHaveProperty("error");
    expect(checkRequest([1])).toHaveProperty("error");
    expect(checkRequest({ ...good, task: "x".repeat(2000) })).toHaveProperty("error");
  });
});

describe("the hurricane-season calendar and the notices", () => {
  it("knows the season runs June 1 to November 30", () => {
    expect(seasonOn(new Date("2026-11-19T12:00:00Z"))).toMatchObject({ inSeason: true, endsOn: "2026-11-30", daysLeft: 11 });
    expect(seasonOn(new Date("2026-12-02T12:00:00Z"))).toMatchObject({ inSeason: false, startsOn: "2027-06-01" });
    expect(seasonOn(new Date("2026-05-20T12:00:00Z"))).toMatchObject({ inSeason: false, startsOn: "2026-06-01" });
  });

  it("returns only what is newer than the time an agent last asked, so many agents can each keep their own place", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    const all = noticesSince(now);
    expect(all.length).toBeGreaterThan(1);
    expect(noticesSince(now, new Date("2026-11-19T23:30:00Z"))).toEqual([]);
    expect(noticesSince(now, new Date("2026-11-19T12:00:00Z")).map((n) => n.id)).toEqual(["live-answers-price"]);
    expect(noticesSince(now, new Date("2026-11-01T00:00:00Z")).map((n) => n.id)).toContain("book-delegating");
    for (const n of all) { expect(n.title.en && n.title.es && n.text.en && n.text.es).toBeTruthy(); expect(new Date(n.at).getTime()).not.toBeNaN(); }
  });

  it("never passes itself off as a forecast, and never gives a phone number or a link", () => {
    for (const n of noticesSince(new Date("2026-11-20T00:00:00Z"))) expect(`${n.title.en} ${n.text.en} ${n.title.es} ${n.text.es}`).not.toMatch(/https?:|www\.|\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b|guarantee/i);
  });
});

describe("the approval page for the person an agent works for", () => {
  const input = { origin: "https://safehubby.com", pass: { price: "$2.99", length: "30 days" }, items: [{ id: "check", title: "Request check", price: "$0.03" }, { id: "books", title: "Books (PDF)", price: "$0.50" }] };

  it("states the real prices, how to cap spending, how to verify, and how to reach a person, in both languages", () => {
    for (const lang of ["en", "es"] as const) {
      const p = buildApprovalPack({ ...input, lang });
      expect(p.forPerson).toContain("$2.99");
      expect(p.forPerson).toContain("$0.03");
      expect(p.forPerson).toContain("contact@safehubby.com");
      expect(p.forPerson).toContain("https://safehubby.com/api/agent/key");
      expect(p.limits.length).toBeGreaterThan(2);
    }
  });

  it("promises nothing about results, and gives no phone number", () => {
    for (const lang of ["en", "es"] as const) expect(buildApprovalPack({ ...input, lang }).forPerson).not.toMatch(/guarantee|garantiz|risk-free|\+?1? ?\(?939\)?|\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b/i);
  });
});
