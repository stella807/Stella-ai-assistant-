import { describe, expect, it } from "vitest";
import {
  CLUB_CONTRIBUTION_PER_MEMBER_CENTS, CLUB_INCLUDED_EVENT_MAX_CENTS, CLUB_MONTHLY_DUES_CENTS, CLUB_PREMIUM_CREDIT_CENTS,
  CLUB_PREMIUM_MARKUP, CLUB_PREMIUM_MONTHS, eventExtraCents, isIncludedEvent, CLUB_DISCLOSURES, CLUB_EXPERIENCES, CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH,
  CLUB_GROUP_RATE_MIN_MEMBERS, CLUB_PERKS, clubBaseRevenueCents, clubMonthKey, duesForCents, findClubExperience,
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

describe("a flat $99 with an event inside it", () => {
  it("is $99 a month", () => {
    expect(CLUB_MONTHLY_DUES_CENTS).toBe(9900);
  });

  it("includes the light outings at the group rate, with nothing extra", () => {
    const light = CLUB_EXPERIENCES.filter(isIncludedEvent).map((e) => e.id).sort();
    expect(light).toEqual(["cigar-night", "golf", "steak-cigar-night"]);
    for (const e of CLUB_EXPERIENCES.filter(isIncludedEvent)) {
      expect(eventExtraCents(e, CLUB_GROUP_RATE_MIN_MEMBERS), e.id).toBe(0);
      expect(e.negotiatedPerPersonCents).toBeLessThanOrEqual(CLUB_INCLUDED_EVENT_MAX_CENTS);
    }
  });

  it("charges the rest of a bigger day, at cost plus 15%, after the credit", () => {
    for (const e of CLUB_EXPERIENCES.filter((x) => !isIncludedEvent(x))) {
      const price = Math.round(e.negotiatedPerPersonCents * (1 + CLUB_PREMIUM_MARKUP));
      expect(eventExtraCents(e, CLUB_GROUP_RATE_MIN_MEMBERS), e.id).toBe(price - CLUB_PREMIUM_CREDIT_CENTS);
      expect(duesForCents(e, CLUB_GROUP_RATE_MIN_MEMBERS), e.id).toBe(CLUB_MONTHLY_DUES_CENTS + price - CLUB_PREMIUM_CREDIT_CENTS);
    }
    const track = CLUB_EXPERIENCES.find((e) => e.id === "track-day")!;
    expect(duesForCents(track, CLUB_GROUP_RATE_MIN_MEMBERS)).toBe(9900 + 27600 - 7800);
  });

  it("never costs a member less than the flat $99", () => {
    for (const e of CLUB_EXPERIENCES) expect(duesForCents(e, 50)).toBeGreaterThanOrEqual(CLUB_MONTHLY_DUES_CENTS);
  });

  it("is built on the venue's regular price below the group size, so the club is never out of pocket", () => {
    for (const e of CLUB_EXPERIENCES) {
      for (const members of [0, 1, CLUB_GROUP_RATE_MIN_MEMBERS - 1]) {
        expect(eventExtraCents(e, members), `${e.id} with ${members}`).toBeGreaterThanOrEqual(eventExtraCents(e, CLUB_GROUP_RATE_MIN_MEMBERS));
      }
    }
    // A light outing priced at retail can run over the included amount: a small extra until the club is 10.
    expect(eventExtraCents(CLUB_EXPERIENCES.find((e) => e.id === "golf")!, 1)).toBe(2000);
    expect(eventExtraCents(CLUB_EXPERIENCES.find((e) => e.id === "steak-cigar-night")!, 1)).toBe(5000);
    expect(eventExtraCents(CLUB_EXPERIENCES.find((e) => e.id === "cigar-night")!, 1)).toBe(0);
  });

  it("tells members about the group-size rule before they join", () => {
    expect(CLUB_DISCLOSURES.join(" ")).toMatch(/group rate/i);
    expect(CLUB_DISCLOSURES.join(" ")).toContain(String(CLUB_GROUP_RATE_MIN_MEMBERS));
  });
});

describe("base revenue and overhead", () => {
  it("rejects a nonsense member count", () => {
    expect(() => clubBaseRevenueCents(-1)).toThrow(/non-negative/i);
    expect(() => clubBaseRevenueCents(1.5)).toThrow(/non-negative/i);
  });

  it("computes the roster's contribution as the per-member amount times members, exactly", () => {
    expect(clubBaseRevenueCents(100)).toBe(CLUB_CONTRIBUTION_PER_MEMBER_CENTS * 100);
  });

  it("keeps the fixed overhead genuinely material, not a rounding error dressed up as one", () => {
    // If overhead were trivially small, "you need real scale" would be a
    // hollow claim — this pins it to a floor that makes the break-even
    // requirement mean something.
    expect(CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH).toBeGreaterThanOrEqual(500_000);
  });

  it("names a real, finite roster size that clears overhead", () => {
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

  it("picks a light outing three months in four and a bigger day in March, June, September and December", () => {
    for (let m = 0; m < 12; m++) {
      const pick = pickMonthlyExperience(new Date(Date.UTC(2026, m, 15)));
      const big = CLUB_PREMIUM_MONTHS.includes(m + 1);
      expect(isIncludedEvent(pick), `month ${m + 1} picked ${pick.id}`).toBe(!big);
    }
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

  it("says the fee is flat and what a bigger day adds, and that skipping it costs nothing more", () => {
    const all = CLUB_DISCLOSURES.join(" ");
    expect(all).toMatch(/flat \$99/);
    expect(all).toMatch(/\$78 credit/);
    expect(all).toMatch(/only if you sign up to go/i);
  });

  it("says the cigar and drink are included in the price, not billed at the venue", () => {
    expect(CLUB_DISCLOSURES.join(" ")).toMatch(/cigar and drink/i);
  });
});

describe("the rotation", () => {
  it("includes a track day and a cigar night", () => {
    const ids = CLUB_EXPERIENCES.map((e) => e.id);
    expect(ids).toContain("track-day");
    expect(ids).toContain("cigar-night");
  });
  it("prices the cigar night inside the 60-65% negotiated range the catalog is built on", () => {
    const e = findClubExperience("cigar-night");
    const ratio = e.negotiatedPerPersonCents / e.retailPerPersonCents;
    expect(ratio).toBeGreaterThanOrEqual(0.6);
    expect(ratio).toBeLessThanOrEqual(0.65);
  });
});
