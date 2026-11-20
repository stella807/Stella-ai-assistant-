import { describe, expect, it } from "vitest";
import { FreeSamples } from "../src/free-sample.ts";

describe("one free live answer a day, so an agent can see what it would pay for", () => {
  const at = new Date("2026-11-20T11:00:00Z"); // 7:00 in Puerto Rico

  it("gives each asker one a day and says when the next one is free: midnight in Puerto Rico", () => {
    const s = new FreeSamples(100);
    expect(s.take("1.2.3.4", at)).toEqual({ ok: true });
    expect(s.take("1.2.3.4", new Date("2026-11-20T23:00:00Z"))).toEqual({ ok: false, reason: "used", nextFreeAt: "2026-11-21T04:00:00.000Z" });
    expect(s.take("5.6.7.8", at)).toEqual({ ok: true });
    // A new day in Puerto Rico starts at 04:00 UTC.
    expect(s.take("1.2.3.4", new Date("2026-11-21T04:00:00Z"))).toEqual({ ok: true });
  });

  it("gives the try back when there was no answer, so a question we cannot answer costs nothing, not even the free one", () => {
    const s = new FreeSamples(100);
    s.take("1.2.3.4", at);
    s.release("1.2.3.4", at);
    expect(s.take("1.2.3.4", at)).toEqual({ ok: true });
  });

  it("stops at a total for the day, so free answers never swamp the public sources they are read from", () => {
    const s = new FreeSamples(2);
    expect(s.take("a", at).ok).toBe(true);
    expect(s.take("b", at).ok).toBe(true);
    expect(s.take("c", at)).toEqual({ ok: false, reason: "full", nextFreeAt: "2026-11-21T04:00:00.000Z" });
  });

  it("keeps no address it was asked from, only a fingerprint, and only for the day", () => {
    const s = new FreeSamples(100);
    s.take("203.0.113.9", at);
    expect(JSON.stringify(s)).not.toContain("203.0.113.9");
  });
});
