import { describe, expect, it } from "vitest";
import {
  CLUB_BASE_DUES_CENTS, CLUB_DISCLOSURES, CLUB_EXPERIENCES, CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH,
  CLUB_PERKS, clubBaseRevenueCents, clubMonthKey, duesForCents, findClubExperience,
  minMembersForOverhead, overheadCovered, pickMonthlyExperience,
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

describe("perks", () => {
  it("includes a cigar and a drink of choice at every event", () => {
    expect(CLUB_PERKS.join(" ")).toMatch(/cigar/i);
    expect(CLUB_PERKS.join(" ")).toMatch(/drink of (your |)choice/i);
  });
});

describe("dues track the month's pick", () => {
  it("is the flat base plus that experience's own negotiated cost, exactly", () => {
    for (const e of CLUB_EXPERIENCES) {
      expect(duesForCents(e)).toBe(CLUB_BASE_DUES_CENTS + e.negotiatedPerPersonCents);
    }
  });

  it("goes up for a pricier pick and down for a cheaper one", () => {
    const cheapest = CLUB_EXPERIENCES.reduce((a, b) => (a.negotiatedPerPersonCents < b.negotiatedPerPersonCents ? a : b));
    const priciest = CLUB_EXPERIENCES.reduce((a, b) => (a.negotiatedPerPersonCents > b.negotiatedPerPersonCents ? a : b));
    expect(duesForCents(priciest)).toBeGreaterThan(duesForCents(cheapest));
  });

  it("never charges less than the flat base, even for the cheapest pick", () => {
    for (const e of CLUB_EXPERIENCES) {
      expect(duesForCents(e)).toBeGreaterThan(CLUB_BASE_DUES_CENTS);
    }
  });
});

describe("base revenue and overhead", () => {
  it("rejects a nonsense member count", () => {
    expect(() => clubBaseRevenueCents(-1)).toThrow(/non-negative/i);
    expect(() => clubBaseRevenueCents(1.5)).toThrow(/non-negative/i);
  });

  it("computes base revenue as the flat base times members, exactly", () => {
    expect(clubBaseRevenueCents(100)).toBe(CLUB_BASE_DUES_CENTS * 100);
  });

  it("keeps the fixed overhead genuinely material, not a rounding error dressed up as one", () => {
    // If overhead were trivially small, "you need real scale" would be a
    // hollow claim — this pins it to a floor that makes the break-even
    // requirement mean something.
    expect(CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH).toBeGreaterThanOrEqual(500_000);
  });

  it("names a real, finite roster size that clears overhead on base dues alone", () => {
    const n = minMembersForOverhead();
    expect(n).toBeGreaterThan(0);
    expect(Number.isFinite(n)).toBe(true);
    expect(overheadCovered(n - 1)).toBe(false);
    expect(overheadCovered(n)).toBe(true);
  });

  it("never reports overhead covered by an empty roster", () => {
    expect(overheadCovered(0)).toBe(false);
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

  it("says dues track the pick rather than a smoothed average", () => {
    expect(CLUB_DISCLOSURES.join(" ")).toMatch(/pricier month costs more/i);
  });

  it("says the cigar and drink are included in the due, not billed at the venue", () => {
    expect(CLUB_DISCLOSURES.join(" ")).toMatch(/cigar and drink/i);
  });
});
