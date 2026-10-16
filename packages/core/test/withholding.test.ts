import { describe, expect, it } from "vitest";
import { PR_WITHHOLDING_RATE, withholdingFor } from "../src/withholding.ts";

describe("Puerto Rico withholding on worker pay", () => {
  it("holds back 10% of a Puerto Rico worker's pay", () => {
    expect(PR_WITHHOLDING_RATE).toBe(0.1);
    expect(withholdingFor({ market: "puerto-rico", payableCents: 10_000 })).toEqual({ withheldCents: 1_000, netCents: 9_000 });
  });

  it("rounds to a whole cent and never loses one between the two halves", () => {
    const r = withholdingFor({ market: "puerto-rico", payableCents: 1_155 });
    expect(r.withheldCents + r.netCents).toBe(1_155);
    expect(r.withheldCents).toBe(116);
  });

  it("holds nothing back when the worker has an exemption certificate", () => {
    expect(withholdingFor({ market: "puerto-rico", payableCents: 10_000, exempt: true })).toEqual({ withheldCents: 0, netCents: 10_000 });
  });

  it("holds nothing back outside Puerto Rico, or when the market is unknown", () => {
    expect(withholdingFor({ market: "texas", payableCents: 10_000 }).withheldCents).toBe(0);
    expect(withholdingFor({ market: "los-angeles", payableCents: 10_000 }).withheldCents).toBe(0);
    expect(withholdingFor({ market: undefined, payableCents: 10_000 }).withheldCents).toBe(0);
  });

  it("holds nothing back from nothing", () => {
    expect(withholdingFor({ market: "puerto-rico", payableCents: 0 })).toEqual({ withheldCents: 0, netCents: 0 });
  });
});
