import { describe, expect, it } from "vitest";
import {
  CONCIERGE_DOCTOR_DISCLOSURES, ELITE_SERVICES, JET_TRAVEL_DISCLOSURES, MAX_ELITE_BRIEF_LENGTH,
  commissionCentsFor, disclosuresFor, doctorAvailableFor, findEliteService, validateEliteRequest,
} from "../src/elite.ts";
import { ELITE_ONLY } from "../src/billing.ts";
import type { EliteBooking } from "../src/elite.ts";

describe("the Elite service catalogue", () => {
  it("only offers services the Elite plan actually unlocks", () => {
    for (const service of ELITE_SERVICES) {
      expect(ELITE_ONLY).toContain(service.feature);
    }
  });

  it("includes jet travel and a concierge doctor", () => {
    const ids = ELITE_SERVICES.map((s) => s.id);
    expect(ids).toContain("jet-travel");
    expect(ids).toContain("concierge-doctor");
  });

  it("rejects an unknown service rather than guessing", () => {
    // @ts-expect-error exercising the runtime guard
    expect(() => findEliteService("helicopter")).toThrow(/unknown elite service/i);
  });
});

describe("commission — the only money Safehubby touches here", () => {
  it("undercuts the typical charter broker on jet travel", () => {
    // Brokers commonly take 10-15%, up to 30%. See docs/billing.md.
    const jet = findEliteService("jet-travel");
    expect(jet.commissionRate).toBeLessThan(0.1);
    expect(jet.commissionRate).toBeGreaterThan(0);
    // A $50,000 charter at 8%.
    expect(commissionCentsFor("jet-travel", 5_000_000)).toBe(400_000);
  });

  it("takes nothing at all on medical care", () => {
    // A percentage of a doctor's fee for sending them a patient is a referral
    // kickback. This is the test that stops someone "fixing" the zero.
    expect(findEliteService("concierge-doctor").commissionRate).toBe(0);
    expect(commissionCentsFor("concierge-doctor", 5_000_00)).toBe(0);
  });

  it("rounds commission down, never in Safehubby's favour", () => {
    // 10% of 1999 is 199.9 — the supplier is not short-changed a cent.
    expect(commissionCentsFor("yacht-charter", 1999)).toBe(199);
  });

  it("is zero on a zero quote, and refuses a nonsense one", () => {
    expect(commissionCentsFor("jet-travel", 0)).toBe(0);
    expect(() => commissionCentsFor("jet-travel", -100)).toThrow(/whole, non-negative/i);
    expect(() => commissionCentsFor("jet-travel", 12.5)).toThrow(/whole, non-negative/i);
  });

  it("never records a charge or a hold on a booking", () => {
    // The type is the enforcement: Safehubby cannot hold a $50,000 charter,
    // so an Elite booking has nowhere to put a chargeId or holdId. If this
    // stops compiling, the money model has quietly changed.
    const booking: EliteBooking = {
      id: "elite_1", travelerId: "usr1", serviceId: "jet-travel", brief: "Austin to Aspen, Friday",
      status: "requested", createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(Object.keys(booking)).not.toContain("chargeId");
    expect(Object.keys(booking)).not.toContain("holdId");
  });
});

describe("a concierge doctor is never an alternative to an ambulance", () => {
  it("disappears entirely when the assessment says call emergency services", () => {
    expect(doctorAvailableFor("call-emergency")).toBe(false);
  });

  it("is available when nothing is flagged as an emergency", () => {
    expect(doctorAvailableFor("get-checked")).toBe(true);
    expect(doctorAvailableFor("stay-and-watch")).toBe(true);
  });

  it("leads its disclosures with emergency care, not with the service", () => {
    expect(CONCIERGE_DOCTOR_DISCLOSURES[0]).toMatch(/not emergency care/i);
    expect(CONCIERGE_DOCTOR_DISCLOSURES[0]).toMatch(/emergency number/i);
  });

  it("says plainly that Safehubby is not a medical provider and gives no advice", () => {
    const text = CONCIERGE_DOCTOR_DISCLOSURES.join(" ");
    expect(text).toMatch(/not a medical provider/i);
    expect(text).toMatch(/no medical advice/i);
    expect(text).toMatch(/licens/i);
  });

  it("says Safehubby takes no share of a medical fee", () => {
    expect(CONCIERGE_DOCTOR_DISCLOSURES.join(" ")).toMatch(/no share of any medical fee/i);
  });
});

describe("jet travel disclosures — 14 CFR Part 295", () => {
  it("covers all three of the disclosures required before contracting", () => {
    const text = JET_TRAVEL_DISCLOSURES.join(" ");
    // Who actually flies the aircraft.
    expect(text).toMatch(/air carrier operating your flight is named/i);
    // What capacity the broker acts in.
    expect(text).toMatch(/as an agent/i);
    // Liability insurance, including its absence.
    expect(text).toMatch(/liability insurance/i);
    expect(text).toMatch(/if it carries none/i);
  });

  it("says Safehubby does not operate aircraft", () => {
    expect(JET_TRAVEL_DISCLOSURES.join(" ")).toMatch(/is not an air carrier/i);
  });

  it("promises a disclosed commission rather than a hidden markup", () => {
    expect(JET_TRAVEL_DISCLOSURES.join(" ")).toMatch(/never a hidden markup/i);
  });

  it("attaches the right disclosures to the right service, and none where none apply", () => {
    expect(disclosuresFor("jet-travel")).toBe(JET_TRAVEL_DISCLOSURES);
    expect(disclosuresFor("concierge-doctor")).toBe(CONCIERGE_DOCTOR_DISCLOSURES);
    expect(disclosuresFor("yacht-charter")).toEqual([]);
  });
});

describe("validateEliteRequest", () => {
  it("needs a brief the desk can act on", () => {
    expect(() => validateEliteRequest({ serviceId: "jet-travel", brief: "" })).toThrow(/say what you need/i);
    expect(() => validateEliteRequest({ serviceId: "jet-travel", brief: "   " })).toThrow(/say what you need/i);
  });

  it("bounds the brief", () => {
    expect(() => validateEliteRequest({
      serviceId: "jet-travel", brief: "x".repeat(MAX_ELITE_BRIEF_LENGTH + 1),
    })).toThrow(new RegExp(`under ${MAX_ELITE_BRIEF_LENGTH}`, "i"));
    expect(() => validateEliteRequest({
      serviceId: "jet-travel", brief: "x".repeat(MAX_ELITE_BRIEF_LENGTH),
    })).not.toThrow();
  });

  it("rejects a service that does not exist", () => {
    // @ts-expect-error exercising the runtime guard
    expect(() => validateEliteRequest({ serviceId: "submarine", brief: "Anywhere" })).toThrow();
  });
});
