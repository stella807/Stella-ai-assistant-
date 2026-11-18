import { describe, expect, it } from "vitest";
import { checkRange, filterLeads, mailtoFor, shortUsd, type BizLeadView } from "../src/app/bizdev-view.ts";

const view = (over: Partial<BizLeadView>): BizLeadView => ({
  id: "a", kind: "investor", name: "A", market: "puerto-rico", interests: [], previousInvestments: [], evidence: [], sources: [],
  status: "discovered", notes: "", createdAt: "", updatedAt: "", score: { total: 10, parts: {}, flags: [], qualified: false },
  lists: [], suppressed: false, ...over,
});

describe("the business-development list", () => {
  it("shows one kind at a time, best score first, and narrows by market, list and search", () => {
    const leads = [
      view({ id: "1", name: "Low", score: { total: 20, parts: {}, flags: [], qualified: false } }),
      view({ id: "2", name: "High", score: { total: 90, parts: {}, flags: [], qualified: true }, lists: ["A"], market: "texas" }),
      view({ id: "3", name: "Hotel", kind: "partner" }),
    ];
    const f = { kind: "investor" as const, market: "all" as const, list: "all" as const, query: "" };
    expect(filterLeads(leads, f).map((l) => l.id)).toEqual(["2", "1"]);
    expect(filterLeads(leads, { ...f, list: "A" }).map((l) => l.id)).toEqual(["2"]);
    expect(filterLeads(leads, { ...f, market: "puerto-rico" }).map((l) => l.id)).toEqual(["1"]);
    expect(filterLeads(leads, { ...f, query: "hig" }).map((l) => l.id)).toEqual(["2"]);
    expect(filterLeads(leads, { ...f, kind: "partner" }).map((l) => l.id)).toEqual(["3"]);
  });

  it("writes amounts short enough for a phone", () => {
    expect(shortUsd(3_800_000)).toBe("$3.8M");
    expect(shortUsd(4_000_000)).toBe("$4M");
    expect(shortUsd(250_000)).toBe("$250K");
    expect(checkRange(undefined)).toBe("Not documented");
    expect(checkRange({ min: 100_000, max: 1_000_000 })).toBe("$100K – $1M");
  });

  it("only offers to open the email app for a real email contact", () => {
    const d = { subject: "Hi & hello", body: "Line one\nLine two" };
    expect(mailtoFor(view({ contactChannel: { kind: "form", value: "https://x.example/contact" } }), d)).toBeUndefined();
    const link = mailtoFor(view({ contactChannel: { kind: "email", value: "dana@isla.example", source: "https://isla.example" } }), d)!;
    expect(link.startsWith("mailto:dana%40isla.example?subject=Hi%20%26%20hello&body=Line%20one%0ALine%20two")).toBe(true);
  });
});
