import { describe, expect, it } from "vitest";
import { LAUNCH_MARKETS, isInLaunchMarket, launchMarketFor, launchMarketNames } from "../src/service-area.ts";

describe("launchMarketFor", () => {
  it("recognizes a point in each launch market", () => {
    // San Juan, PR
    expect(launchMarketFor({ lat: 18.4655, lng: -66.1057 })?.id).toBe("puerto-rico");
    // Austin, TX
    expect(launchMarketFor({ lat: 30.2672, lng: -97.7431 })?.id).toBe("texas");
    // Downtown Los Angeles
    expect(launchMarketFor({ lat: 34.0407, lng: -118.2468 })?.id).toBe("los-angeles");
  });

  it("returns null well outside every launch market", () => {
    // New York City
    expect(launchMarketFor({ lat: 40.7128, lng: -74.006 })).toBeNull();
  });

  it("agrees with isInLaunchMarket", () => {
    const inMarket = { lat: 30.2672, lng: -97.7431 };
    const outOfMarket = { lat: 40.7128, lng: -74.006 };
    expect(isInLaunchMarket(inMarket)).toBe(true);
    expect(isInLaunchMarket(outOfMarket)).toBe(false);
  });
});

describe("launchMarketNames", () => {
  it("names every market, in the same fixed order", () => {
    expect(launchMarketNames()).toBe(LAUNCH_MARKETS.map((m) => m.label).join(", "));
    expect(launchMarketNames()).toMatch(/Puerto Rico/);
    expect(launchMarketNames()).toMatch(/Texas/);
    expect(launchMarketNames()).toMatch(/Los Angeles/);
  });
});
