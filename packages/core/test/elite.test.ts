import { describe, expect, it } from "vitest";
import {
  CONCIERGE_DOCTOR_DISCLOSURES, ELITE_DESK_MEMBERSHIP, ELITE_EVENTS, ELITE_SERVICES, JET_TRAVEL_DISCLOSURES,
  MAX_ELITE_BRIEF_LENGTH, commissionCentsFor, directMembershipCrossoverCents, disclosuresFor,
  doctorAvailableFor, eliteBreakEvenMembers, eliteDeskAnnualCostCents, eliteDeskIsViable,
  eliteEventHasRoom, findEliteEvent, findEliteService, upcomingEliteEvents, validateEliteRequest,
} from "../src/elite.ts";
import { ELITE_LADDER, ELITE_ONLY, eliteSpendingAllowanceCents, findPlan, includedConciergeHours, isElitePlan } from "../src/billing.ts";
import { serviceFeeFor } from "../src/concierge.ts";
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
  const dues = findPlan("elite").monthlyCents; // $500, the entry rung

  it("needs just one member, in year one and after, to carry the house membership", () => {
    // Moves with the dues, and the ladder moved them a long way: entry dues
    // ($1,500/mo) now comfortably clear the desk's own annual cost even
    // with the one-off initiation counted, so a single member carries it
    // in both the founding year and every year after.
    expect(eliteBreakEvenMembers(dues, true)).toBe(1);
    expect(eliteBreakEvenMembers(dues, false)).toBe(1);
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
    // The rule this exists for: a desk bought for zero members is the most
    // expensive possible way to learn the tier has not sold yet. At $1,500
    // entry dues the break-even is one member, not two, so that is the line
    // now — not because the rule softened, but because the dues did their
    // job.
    expect(eliteDeskIsViable(0, dues)).toBe(false);
    expect(eliteDeskIsViable(1, dues)).toBe(true);
    expect(eliteDeskIsViable(50, dues)).toBe(true);
  });

  it("is not sold as the cheap way into the desk, because it is not one", () => {
    // Entry dues now run three times the desk's own membership on their
    // own, so Elite buys nothing on jet access alone. What it buys is the
    // included hours and the covered physician's retainer, either of which
    // is worth more than the whole desk membership by itself — that is the
    // claim the tier has to stand on, and the one this pins.
    const direct = ELITE_DESK_MEMBERSHIP.monthlyCents * 12;
    expect(dues * 12).toBeGreaterThanOrEqual(direct);
  });

  it("never includes more hours than the rung's price pays for", () => {
    // The one line every rung has to stay the right side of. An allowance
    // worth more than the membership is a tier that loses money before the
    // desk, the insurance or a single booking is counted.
    for (const id of ELITE_LADDER) {
      const plan = findPlan(id);
      const hoursValue = includedConciergeHours(id) * serviceFeeFor("book-and-buy", false, 1, 1);
      expect(hoursValue, `${id} hours vs price`).toBeLessThan(plan.monthlyCents);
    }
  });

  it("climbs in both price and hours, so a dearer rung is never a worse deal", () => {
    const rungs = ELITE_LADDER.map(findPlan);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i]!.monthlyCents).toBeGreaterThan(rungs[i - 1]!.monthlyCents);
      expect(includedConciergeHours(rungs[i]!.id))
        .toBeGreaterThan(includedConciergeHours(rungs[i - 1]!.id));
    }
  });

  it("reports no crossover at all once dues meet the direct membership", () => {
    // Null rather than zero. At these dues Elite is dearer than joining the
    // desk direct from the first dollar of charter, and a 0 would read as a
    // threshold a light flyer could sit under — the opposite of the truth.
    const jet = findEliteService("jet-travel");
    expect(directMembershipCrossoverCents(dues, jet.commissionRate)).toBeNull();
  });

  it("still finds the crossover where one genuinely exists", () => {
    // The function is not broken, the dues moved past it. At dues below the
    // direct membership there is a real spend where the two meet, and at it
    // the member pays the same either way.
    const cheapDues = 10_000;
    const jet = findEliteService("jet-travel");
    const crossover = directMembershipCrossoverCents(cheapDues, jet.commissionRate);
    expect(crossover).not.toBeNull();
    const viaElite = cheapDues * 12 + commissionCentsFor("jet-travel", crossover!);
    expect(viaElite).toBeCloseTo(ELITE_DESK_MEMBERSHIP.monthlyCents * 12, -2);
  });

  it("needs a commission to trade the crossover off against", () => {
    // The concierge doctor takes 0% on purpose, so there is no crossover to
    // compute there — and pretending one exists would invent a number.
    expect(() => directMembershipCrossoverCents(dues, 0)).toThrow(/commission/i);
  });

  it("is a membership business now, not a commission one", () => {
    // It used to be the other way round: at $119 dues, one four-hour midsize
    // charter earned more than a member's entire year. At $500 it does not,
    // and the tier's revenue is the dues and the hours rather than the spread
    // on somebody's travel. Worth pinning, because it changes what the desk
    // is for — it is a reason to hold the membership, not the earner.
    const fourHourMidsize = 4 * 796_600;
    expect(commissionCentsFor("jet-travel", fourHourMidsize)).toBeLessThan(dues * 12);
    // And at the top rung the commission is not remotely the point.
    expect(commissionCentsFor("jet-travel", fourHourMidsize))
      .toBeLessThan(findPlan("elite-private").monthlyCents);
  });
});

describe("Elite member events", () => {
  it("rejects an event that does not exist", () => {
    expect(() => findEliteEvent("secret-gala")).toThrow(/unknown elite event/i);
  });

  it("keeps every catalogued event capped at a real, positive number of seats", () => {
    for (const event of ELITE_EVENTS) {
      expect(event.capacity).toBeGreaterThan(0);
    }
  });

  it("only surfaces events that have not already happened", () => {
    const now = new Date("2026-09-17T00:00:00Z");
    const upcoming = upcomingEliteEvents(now);
    for (const event of upcoming) {
      expect(new Date(event.date).getTime()).toBeGreaterThanOrEqual(now.getTime());
    }
    // Sorted soonest first, not catalogue order.
    for (let i = 1; i < upcoming.length; i++) {
      expect(upcoming[i]!.date >= upcoming[i - 1]!.date).toBe(true);
    }
  });

  it("has room until the roster fills the exact capacity, then none", () => {
    const event = ELITE_EVENTS[0]!;
    expect(eliteEventHasRoom(event, 0)).toBe(true);
    expect(eliteEventHasRoom(event, event.capacity - 1)).toBe(true);
    expect(eliteEventHasRoom(event, event.capacity)).toBe(false);
  });
});

describe("eliteSpendingAllowanceCents — the free bee, funded by Safehubby", () => {
  it("is zero on every non-Elite plan", () => {
    expect(eliteSpendingAllowanceCents("free")).toBe(0);
    expect(eliteSpendingAllowanceCents("family")).toBe(0);
  });

  it("is exactly ten percent of the rung's own dues", () => {
    for (const id of ELITE_LADDER) {
      expect(isElitePlan(id)).toBe(true);
      expect(eliteSpendingAllowanceCents(id)).toBe(Math.round(findPlan(id).monthlyCents * 0.1));
    }
  });

  it("climbs with the ladder, the same direction dues and hours already climb", () => {
    const rungs = ELITE_LADDER.map(eliteSpendingAllowanceCents);
    for (let i = 1; i < rungs.length; i++) expect(rungs[i]!).toBeGreaterThan(rungs[i - 1]!);
  });
});
