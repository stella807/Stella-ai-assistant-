import { describe, expect, it } from "vitest";
import {
  CONCIERGE_DOCTOR_DISCLOSURES, ELITE_DESK_MEMBERSHIP, ELITE_SERVICES, JET_TRAVEL_DISCLOSURES,
  MAX_ELITE_BRIEF_LENGTH, commissionCentsFor, directMembershipCrossoverCents, disclosuresFor,
  doctorAvailableFor, eliteBreakEvenMembers, eliteDeskAnnualCostCents, eliteDeskIsViable,
  findEliteService, validateEliteRequest,
} from "../src/elite.ts";
import { ELITE_ONLY, findPlan } from "../src/billing.ts";
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

describe("whether the Elite desk pays for itself", () => {
  const dues = findPlan("elite").monthlyCents; // 14900

  it("needs six members in year one, five after, to carry the house membership", () => {
    // Moves with the dues: repricing Elite down to sit under the do-it-
    // yourself alternative means more members are needed to carry the desk.
    expect(eliteBreakEvenMembers(dues, true)).toBe(6);
    expect(eliteBreakEvenMembers(dues, false)).toBe(5);
  });

  it("counts the initiation only in the first year", () => {
    expect(eliteDeskAnnualCostCents(true)).toBe(850_000);
    expect(eliteDeskAnnualCostCents(false)).toBe(600_000);
  });

  it("rounds the member count up, because four-and-a-bit members is five", () => {
    // Dues chosen so the division lands just over a whole number.
    expect(eliteBreakEvenMembers(20_000, false)).toBe(3); // 600_000 / 240_000 = 2.5
  });

  it("refuses to compute a break-even on dues of nothing", () => {
    expect(() => eliteBreakEvenMembers(0)).toThrow(/positive/i);
    expect(() => eliteBreakEvenMembers(-1)).toThrow(/positive/i);
  });

  it("says not to buy the desk before it can be carried", () => {
    // The rule this exists for: a desk bought for two members is the most
    // expensive possible way to learn the tier has not sold yet.
    expect(eliteDeskIsViable(2, dues)).toBe(false);
    expect(eliteDeskIsViable(5, dues)).toBe(false);
    expect(eliteDeskIsViable(6, dues)).toBe(true);
    expect(eliteDeskIsViable(50, dues)).toBe(true);
  });

  it("is priced well below joining the partner desk directly, for normal use", () => {
    const direct = ELITE_DESK_MEMBERSHIP.monthlyCents * 12;
    expect(dues * 12).toBeLessThan(direct);
  });

  it("knows the spend above which a member should join the desk directly", () => {
    const jet = findEliteService("jet-travel");
    const crossover = directMembershipCrossoverCents(dues, jet.commissionRate);
    // Around $57.1k of charter a year — it rose when the dues fell, which is
    // the right direction: cheaper dues means Elite stays the better deal
    // further up the spend curve. Below it Elite is the cheaper way in;
    // above it we should be telling them to go direct rather than selling
    // them the more expensive option.
    expect(crossover).toBeGreaterThan(5_500_000);
    expect(crossover).toBeLessThan(6_000_000);

    // Checked against the two costs rather than asserted: at the crossover
    // the member pays the same either way.
    const viaElite = dues * 12 + commissionCentsFor("jet-travel", crossover);
    expect(viaElite).toBeCloseTo(ELITE_DESK_MEMBERSHIP.monthlyCents * 12, -2);
  });

  it("needs a commission to trade the crossover off against", () => {
    // The concierge doctor takes 0% on purpose, so there is no crossover to
    // compute there — and pretending one exists would invent a number.
    expect(() => directMembershipCrossoverCents(dues, 0)).toThrow(/commission/i);
  });

  it("earns more from one real charter than from a member's whole year of dues", () => {
    // The point of the tier: dues cover the desk, bookings are the business.
    const fourHourMidsize = 4 * 796_600;
    expect(commissionCentsFor("jet-travel", fourHourMidsize)).toBeGreaterThan(dues * 12);
  });
});
