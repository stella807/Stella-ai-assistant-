import { describe, expect, it } from "vitest";
import {
  EMERGENCY_NUMBERS, RED_FLAGS, assess, assessNonEmergency, dispatcherScript,
  emergencyNumberFor, shouldPromptEmergencyCheck,
} from "../src/emergency.ts";

describe("red flags", () => {
  it("covers the recognised alcohol poisoning signs", () => {
    const ids = RED_FLAGS.map((f) => f.id);
    for (const id of ["unresponsive", "vomiting-unresponsive", "seizure", "slow-breathing", "blue-or-pale"]) {
      expect(ids).toContain(id);
    }
  });

  it("includes head injury, which can hide behind drunkenness", () => {
    expect(RED_FLAGS.map((f) => f.id)).toContain("head-injury");
  });
});

describe("assessment", () => {
  it("escalates on a SINGLE red flag — never waits for a second", () => {
    for (const flag of RED_FLAGS) {
      expect(assess([flag.id]).escalation).toBe("call-emergency");
    }
  });

  it("tells them to call first, before anything else", () => {
    expect(assess(["unresponsive"]).steps[0]).toMatch(/call emergency services now/i);
  });

  it("tells them to turn the person on their side", () => {
    expect(assess(["vomiting-unresponsive"]).steps.join(" ")).toMatch(/side/i);
  });

  it("never suggests coffee, a cold shower, or sleeping it off alone", () => {
    const text = assess(["seizure"]).steps.join(" ").toLowerCase();
    expect(text).toMatch(/do not give them coffee/);
    expect(text).toMatch(/do not leave them to sleep it off alone/);
  });

  it("does not manufacture an emergency when nothing is flagged", () => {
    const a = assess([]);
    expect(a.escalation).toBe("stay-and-watch");
    expect(a.flagged).toEqual([]);
  });

  it("still says to call if anything starts", () => {
    expect(assess([]).steps.join(" ")).toMatch(/call emergency services immediately/i);
  });

  it("never tells anyone to drive to hospital themselves", () => {
    const all = [assess([]), assess(["unresponsive"]), assessNonEmergency([])]
      .flatMap((a) => a.steps).join(" ").toLowerCase();
    expect(all).not.toMatch(/drive them|drive to|drive yourself/);
  });

  it("routes the not-an-emergency case to care without driving", () => {
    const a = assessNonEmergency(["cut on their hand"]);
    expect(a.escalation).toBe("get-checked");
    expect(a.steps.join(" ")).toMatch(/do not drive/i);
    expect(a.steps.join(" ")).toContain("cut on their hand");
  });
});

describe("emergency numbers", () => {
  it("knows the common ones", () => {
    expect(emergencyNumberFor("US")!.number).toBe("911");
    expect(emergencyNumberFor("gb")!.number).toBe("999");
    expect(emergencyNumberFor("AU")!.number).toBe("000");
    expect(emergencyNumberFor("NZ")!.number).toBe("111");
    expect(emergencyNumberFor("JP")!.number).toBe("119");
  });

  it("covers Puerto Rico", () => {
    expect(emergencyNumberFor("PR")!.number).toBe("911");
  });

  it("falls back to 112 across the EU and EEA", () => {
    for (const code of ["FR", "DE", "ES", "IT", "NO", "CH"]) {
      expect(emergencyNumberFor(code)!.number).toBe("112");
    }
  });

  it("returns null rather than guessing for an unknown region", () => {
    // A wrong number costs the minutes that matter.
    expect(emergencyNumberFor("XX")).toBeNull();
    expect(emergencyNumberFor(null)).toBeNull();
    expect(emergencyNumberFor("")).toBeNull();
  });

  it("carries poison control where there is one", () => {
    expect(emergencyNumberFor("US")!.poisonControl).toBe("1-800-222-1222");
  });

  it("has a number for every listed country", () => {
    for (const n of EMERGENCY_NUMBERS) expect(n.number.length).toBeGreaterThan(2);
  });
});

describe("dispatcher script", () => {
  const base = {
    emergencyNumber: "911", locationLabel: "The Anchor Tavern, 12 Harbor Ave",
    lat: 40.7148, lng: -74.0018, standardDrinks: 9, hoursDrinking: 4,
    flagged: [RED_FLAGS[0]!],
  };

  it("opens by naming what is needed", () => {
    expect(dispatcherScript(base)[0]).toMatch(/need an ambulance/i);
  });

  it("gives location, symptoms and how much they drank", () => {
    const text = dispatcherScript(base).join(" ");
    expect(text).toContain("The Anchor Tavern");
    expect(text).toContain("40.71480");
    expect(text).toMatch(/can't be woken/i);
    expect(text).toMatch(/9 standard drinks/);
  });

  it("copes with no location and no drink log", () => {
    const text = dispatcherScript({ ...base, locationLabel: null, lat: undefined, lng: undefined, standardDrinks: 0, flagged: [] }).join(" ");
    expect(text).toMatch(/i'll give you our location/i);
    expect(text).toMatch(/not sure exactly how much/i);
  });
});

describe("prompting on its own", () => {
  it("pushes the check at the severe band", () => {
    expect(shouldPromptEmergencyCheck("severe", 0)).toBe(true);
  });

  it("pushes it when a high estimate meets a missed check-in", () => {
    expect(shouldPromptEmergencyCheck("high", 1)).toBe(true);
    expect(shouldPromptEmergencyCheck("high", 0)).toBe(false);
  });

  it("stays quiet on an ordinary night", () => {
    expect(shouldPromptEmergencyCheck("low", 0)).toBe(false);
    expect(shouldPromptEmergencyCheck("moderate", 0)).toBe(false);
  });
});
