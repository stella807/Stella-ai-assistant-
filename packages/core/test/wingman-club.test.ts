import { describe, expect, it } from "vitest";
import {
  CLUB_DISCLOSURES, CLUB_EXPERIENCES, CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH, CLUB_MONTHLY_CENTS,
  averageExperienceCostCents, canAffordExperience, clubEventBudgetCents, clubMonthKey,
  clubMonthlyRevenueCents, findClubExperience, minMembersForAverageExperience,
  perMemberEventBudgetCents, pickMonthlyExperience, reserveDeltaCents,
} from "../src/wingman-club.ts";

describe("the catalogue", () => {
  it("rejects an unknown experience rather than guessing", () => {
    expect(() => findClubExperience("bungee")).toThrow(/unknown club experience/i);
  });

  it("prices every negotiated rate below its own retail price", () => {
    // A "negotiated" rate that isn't actually cheaper than retail is not a
    // negotiated rate, it's a markup with a nicer name.
    for (const e of CLUB_EXPERIENCES) {
      expect(e.negotiatedPerPersonCents, e.id).toBeLessThan(e.retailPerPersonCents);
    }
  });
});

describe("revenue and the event budget", () => {
  it("rejects a nonsense member count", () => {
    expect(() => clubMonthlyRevenueCents(-1)).toThrow(/non-negative/i);
    expect(() => clubMonthlyRevenueCents(1.5)).toThrow(/non-negative/i);
  });

  it("computes revenue as dues times members, exactly", () => {
    expect(clubMonthlyRevenueCents(100)).toBe(CLUB_MONTHLY_CENTS * 100);
  });

  it("never lets the event budget go negative when overhead exceeds revenue", () => {
    // A club too small to clear overhead has nothing left over that month —
    // not a deficit charged back to members who already paid their dues.
    expect(clubEventBudgetCents(1)).toBe(0);
    expect(clubEventBudgetCents(0)).toBe(0);
  });

  it("gives a zero-member roster a zero per-member budget rather than dividing by zero", () => {
    expect(perMemberEventBudgetCents(0)).toBe(0);
  });

  it("raises the per-member budget monotonically as the roster grows", () => {
    // Fixed overhead is a smaller share of a bigger pool, so the residual per
    // head can only go up (or hold steady once overhead is fully amortized),
    // never down, as membership grows.
    const sizes = [10, 50, 200, 1000, 5000];
    for (let i = 1; i < sizes.length; i++) {
      expect(perMemberEventBudgetCents(sizes[i]!)).toBeGreaterThanOrEqual(perMemberEventBudgetCents(sizes[i - 1]!));
    }
  });

  it("approaches, but never reaches or exceeds, the dues themselves", () => {
    // The ceiling on per-member spending power is what one person actually
    // paid in — overhead can only eat into that, never turn it into more.
    for (const n of [1, 100, 10_000, 1_000_000]) {
      expect(perMemberEventBudgetCents(n)).toBeLessThan(CLUB_MONTHLY_CENTS);
    }
  });
});

describe("pricing against the rotation's average, not against any one month", () => {
  it("computes the live average from the actual catalogue, not a copied-in number", () => {
    const total = CLUB_EXPERIENCES.reduce((sum, e) => sum + e.negotiatedPerPersonCents, 0);
    expect(averageExperienceCostCents()).toBe(Math.round(total / CLUB_EXPERIENCES.length));
  });

  it("refuses to name a break-even roster size when dues do not even clear the average", () => {
    // If dues sit at or below the rotation's own average cost, no amount of
    // scale ever fixes that — the fix is the price or the catalogue, not more
    // members. This is the test that would catch dues being cut without
    // anyone checking the arithmetic still works.
    const brokenCatalog = CLUB_EXPERIENCES.map((e) => ({ ...e, negotiatedPerPersonCents: CLUB_MONTHLY_CENTS + 100 }));
    expect(() => minMembersForAverageExperience(brokenCatalog)).toThrow(/no roster size fixes/i);
  });

  it("names a real, finite break-even roster for the actual priced catalogue", () => {
    const n = minMembersForAverageExperience();
    expect(n).toBeGreaterThan(0);
    expect(Number.isFinite(n)).toBe(true);
    // Just below the break-even point, the average is not yet affordable...
    expect(perMemberEventBudgetCents(n - 1)).toBeLessThan(averageExperienceCostCents());
    // ...and at it, it is.
    expect(perMemberEventBudgetCents(n)).toBeGreaterThanOrEqual(averageExperienceCostCents());
  });

  it("keeps the fixed overhead genuinely material, not a rounding error dressed up as one", () => {
    // If overhead were trivially small, "you need real scale" would be a
    // hollow claim — this pins it to a floor that makes the break-even
    // requirement mean something.
    expect(CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH).toBeGreaterThanOrEqual(500_000);
  });
});

describe("what the roster can actually afford, month to month", () => {
  it("affords the cheap end of the rotation well below the break-even roster size", () => {
    const cheapest = CLUB_EXPERIENCES.reduce((a, b) => (a.negotiatedPerPersonCents < b.negotiatedPerPersonCents ? a : b));
    const smallRoster = 300;
    expect(smallRoster).toBeLessThan(minMembersForAverageExperience());
    expect(canAffordExperience(cheapest, smallRoster)).toBe(true);
  });

  it("does not afford the priciest experience even at a roster well past break-even", () => {
    const priciest = CLUB_EXPERIENCES.reduce((a, b) => (a.negotiatedPerPersonCents > b.negotiatedPerPersonCents ? a : b));
    // Past break-even for the *average*, but a specific expensive month can
    // still outrun that month's own per-member budget — that gap is exactly
    // what the reserve from cheaper months exists to cover.
    expect(canAffordExperience(priciest, minMembersForAverageExperience())).toBe(false);
  });

  it("reports a reserve surplus for a cheap month and a drawdown for a pricey one, at the same roster size", () => {
    const roster = 2000;
    const cheapest = CLUB_EXPERIENCES.reduce((a, b) => (a.negotiatedPerPersonCents < b.negotiatedPerPersonCents ? a : b));
    const priciest = CLUB_EXPERIENCES.reduce((a, b) => (a.negotiatedPerPersonCents > b.negotiatedPerPersonCents ? a : b));
    expect(reserveDeltaCents(cheapest, roster).perMemberCents).toBeGreaterThan(0);
    expect(reserveDeltaCents(priciest, roster).perMemberCents).toBeLessThan(0);
  });

  it("always reports the total as exactly the per-member delta times the roster", () => {
    const e = CLUB_EXPERIENCES[0]!;
    for (const n of [1, 1000, 2000]) {
      const { perMemberCents, totalCents } = reserveDeltaCents(e, n);
      expect(totalCents).toBe(perMemberCents * n);
    }
  });

  it("only improves the per-member delta as the roster grows, for the same fixed-cost experience", () => {
    // perMemberEventBudgetCents only approaches its ceiling asymptotically —
    // it is not literally identical between arbitrary sizes — but for a
    // fixed experience it must never move the wrong way as the roster grows.
    const e = CLUB_EXPERIENCES[0]!;
    const sizes = [500, 1000, 2000, 5000];
    for (let i = 1; i < sizes.length; i++) {
      expect(reserveDeltaCents(e, sizes[i]!).perMemberCents)
        .toBeGreaterThanOrEqual(reserveDeltaCents(e, sizes[i - 1]!).perMemberCents);
    }
  });
});

describe("the monthly reveal", () => {
  it("is deterministic: the same month always lands on the same pick", () => {
    const a = pickMonthlyExperience(new Date("2026-09-03T00:00:00Z"));
    const b = pickMonthlyExperience(new Date("2026-09-29T00:00:00Z"));
    expect(a.id).toBe(b.id);
  });

  it("changes across months, at least somewhere in a year", () => {
    const picks = new Set<string>();
    for (let m = 0; m < 12; m++) {
      picks.add(pickMonthlyExperience(new Date(Date.UTC(2026, m, 15))).id);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it("only ever picks something that is actually in the catalogue offered", () => {
    const small = [CLUB_EXPERIENCES[0]!, CLUB_EXPERIENCES[1]!];
    for (let m = 0; m < 12; m++) {
      const pick = pickMonthlyExperience(new Date(Date.UTC(2026, m, 1)), small);
      expect(small.map((e) => e.id)).toContain(pick.id);
    }
  });

  it("refuses to draw from an empty rotation", () => {
    expect(() => pickMonthlyExperience(new Date(), [])).toThrow(/needs at least one/i);
  });

  it("keys the month in UTC as YYYY-MM", () => {
    expect(clubMonthKey(new Date("2026-01-05T23:00:00Z"))).toBe("2026-01");
    expect(clubMonthKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });
});

describe("disclosures", () => {
  it("says plainly that a reveal is not a confirmed booking", () => {
    expect(CLUB_DISCLOSURES.join(" ")).toMatch(/not a booking/i);
  });

  it("says a missed month is not a personal credit", () => {
    expect(CLUB_DISCLOSURES.join(" ")).toMatch(/not a credit/i);
  });
});
