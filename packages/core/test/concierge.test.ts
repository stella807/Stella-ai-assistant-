import { describe, expect, it } from "vitest";
import {
  CONCIERGE_CATEGORIES, CONCIERGE_DISCLOSURES, CONCIERGE_MAX_CAP_CENTS, CONCIERGE_MIN_CAP_CENTS,
  conciergeCategoryLabel, validateConciergeRequest,
} from "../src/concierge.ts";
import type { ConciergeTaskInput } from "../src/concierge.ts";

const request = (over: Partial<ConciergeTaskInput> = {}): ConciergeTaskInput => ({
  category: "grab-something",
  note: "Grab a burger and fries from The Anchor Tavern",
  location: { lat: 40.714, lng: -74.003, label: "The Anchor Tavern" },
  spendCapCents: 2500,
  ...over,
});

describe("validateConciergeRequest", () => {
  it("accepts a well-formed request", () => {
    expect(() => validateConciergeRequest(request())).not.toThrow();
  });

  it("rejects a category outside the fixed list", () => {
    expect(() => validateConciergeRequest(request({ category: "babysit" as never }))).toThrow(/unknown task/i);
  });

  it("requires a note the assistant can act on", () => {
    expect(() => validateConciergeRequest(request({ note: "" }))).toThrow(/describe the task/i);
    expect(() => validateConciergeRequest(request({ note: "   " }))).toThrow(/describe the task/i);
  });

  it("bounds the note length", () => {
    expect(() => validateConciergeRequest(request({ note: "x".repeat(281) }))).toThrow(/280 characters/);
    expect(() => validateConciergeRequest(request({ note: "x".repeat(280) }))).not.toThrow();
  });

  it("enforces the spend-cap bounds — a hard ceiling, not a suggestion", () => {
    expect(() => validateConciergeRequest(request({ spendCapCents: CONCIERGE_MIN_CAP_CENTS - 1 }))).toThrow(/spend cap/i);
    expect(() => validateConciergeRequest(request({ spendCapCents: CONCIERGE_MAX_CAP_CENTS + 1 }))).toThrow(/spend cap/i);
    expect(() => validateConciergeRequest(request({ spendCapCents: CONCIERGE_MIN_CAP_CENTS }))).not.toThrow();
    expect(() => validateConciergeRequest(request({ spendCapCents: CONCIERGE_MAX_CAP_CENTS }))).not.toThrow();
  });

  it("rejects a non-whole-cent cap", () => {
    expect(() => validateConciergeRequest(request({ spendCapCents: 25.5 }))).toThrow(/spend cap/i);
  });
});

describe("categories", () => {
  it("has a label for every category, findable by id", () => {
    for (const c of CONCIERGE_CATEGORIES) expect(conciergeCategoryLabel(c.id)).toBe(c.label);
  });

  it("never enters someone's home, whatever the task is called", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/will not enter your home/i);
  });
});

describe("disclosures", () => {
  it("says plainly this is not Safehubby's own employee", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/not a Safehubby employee/i);
  });

  it("states the cap is exact, not padded", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/never more/i);
  });

  it("is not a substitute for calling emergency services", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/not an emergency service/i);
  });
});
