import { describe, expect, it } from "vitest";
import {
  ASSISTANT_MAX_CAPACITY, ASSISTANT_MIN_CAPACITY, CONCIERGE_CATEGORIES, CONCIERGE_DISCLOSURES,
  CONCIERGE_MAX_CAP_CENTS, CONCIERGE_MIN_CAP_CENTS, conciergeCategoryLabel, describeAssistantCapacity,
  isAssistantAvailable, validateConciergeRequest,
} from "../src/concierge.ts";
import type { AssistantProfile, ConciergeTaskInput } from "../src/concierge.ts";

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

  it("says the assistant pays with an issued card, never the subscriber's own", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/card issued for this task alone/i);
  });
});

const profile = (over: Partial<AssistantProfile> = {}): AssistantProfile => ({
  id: "a1",
  name: "Jordan",
  categories: ["grab-something"],
  maxConcurrentCustomers: 2,
  currentCustomers: 1,
  ...over,
});

describe("assistant roster", () => {
  it("bounds capacity to 1-3, the assistant's own stated comfort level", () => {
    expect(ASSISTANT_MIN_CAPACITY).toBe(1);
    expect(ASSISTANT_MAX_CAPACITY).toBe(3);
  });

  it("is available while under its own stated capacity", () => {
    expect(isAssistantAvailable(profile({ maxConcurrentCustomers: 2, currentCustomers: 1 }))).toBe(true);
    expect(isAssistantAvailable(profile({ maxConcurrentCustomers: 2, currentCustomers: 2 }))).toBe(false);
    expect(isAssistantAvailable(profile({ maxConcurrentCustomers: 2, currentCustomers: 3 }))).toBe(false);
  });

  it("describes remaining room rather than a bare number", () => {
    expect(describeAssistantCapacity(profile({ maxConcurrentCustomers: 3, currentCustomers: 1 })))
      .toMatch(/room for 2 more/i);
  });

  it("says plainly when someone is full up", () => {
    expect(describeAssistantCapacity(profile({ maxConcurrentCustomers: 1, currentCustomers: 1 })))
      .toMatch(/at capacity/i);
  });
});
