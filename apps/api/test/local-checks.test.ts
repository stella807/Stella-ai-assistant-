import { describe, expect, it } from "vitest";
import { buildCheck, freshCount, searchChecks, type LocalCheck } from "../src/local-checks.ts";

const now = new Date("2026-11-19T15:00:00Z");
const base = { kind: "open", place: "Farmacia Central, Santurce", subject: "Open today", statement: "Open, the door is unlocked and the counter is staffed.", observedAt: "2026-11-19T14:30:00Z", checkedBy: "Maria", evidence: "photo" };
const make = (over: Record<string, unknown> = {}, id = "chk_1") => buildCheck({ ...base, ...over }, now, id) as LocalCheck;

describe("recording a check somebody made on the ground", () => {
  it("keeps what was seen, when, and by whom, and says how long it can be trusted", () => {
    const c = make();
    expect(c).toMatchObject({ id: "chk_1", kind: "open", place: "Farmacia Central, Santurce", checkedBy: "Maria", evidence: "photo", observedAt: "2026-11-19T14:30:00.000Z" });
    expect(c.validUntil).toBe("2026-11-19T20:30:00.000Z");
  });

  it("lets something that changes fast, like a line, go stale fast", () => {
    expect(make({ kind: "line" }).validUntil).toBe("2026-11-19T15:15:00.000Z");
    expect(make({ kind: "stock" }).validUntil).toBe("2026-11-19T17:30:00.000Z");
  });

  it("accepts a shorter time, never a longer one than a day", () => {
    expect(make({ validForMinutes: 60 }).validUntil).toBe("2026-11-19T15:30:00.000Z");
    expect(make({ validForMinutes: 99999 }).validUntil).toBe("2026-11-20T14:30:00.000Z");
  });

  it("refuses what cannot be trusted: no one who was there, a time in the future, a week-old sighting, or an unknown kind", () => {
    for (const bad of [{ checkedBy: "" }, { observedAt: "2026-11-19T16:00:00Z" }, { observedAt: "2026-11-01T10:00:00Z" }, { observedAt: "yesterday" }, { kind: "rumor" }, { place: "x" }, { statement: "" }, { evidence: "trust me" }]) {
      expect(buildCheck({ ...base, ...bad }, now, "x"), JSON.stringify(bad)).toHaveProperty("error");
    }
  });

  it("keeps links, email addresses and phone numbers out of a check", () => {
    for (const bad of ["call 787-555-0182 to confirm", "see https://example.com", "write to someone@example.com", "visit www.example.com"]) {
      expect(buildCheck({ ...base, statement: bad }, now, "x"), bad).toHaveProperty("error");
    }
  });
});

describe("asking what is true right now", () => {
  const all = [
    make({}, "a"),
    make({ place: "Walgreens, Condado", subject: "Insulin pens in stock", kind: "stock", statement: "Six boxes on the shelf at 9am." }, "b"),
    make({ place: "Luis Munoz Marin airport", subject: "Checkpoint B line", kind: "line", observedAt: "2026-11-19T14:10:00Z", statement: "About 20 minutes." }, "c"),
  ];

  it("returns only checks that are still fresh, newest first, with their age", () => {
    const found = searchChecks(all, "pharmacy open", now);
    expect(found.fresh.length).toBeGreaterThan(0);
    expect(found.fresh[0]).toMatchObject({ place: "Farmacia Central, Santurce", ageMinutes: 30, fresh: true });
  });

  it("does not hand out a stale line time, and says how old the newest one is", () => {
    const found = searchChecks(all, "airport checkpoint line", now);
    expect(found.fresh).toEqual([]);
    expect(found.newestStaleMinutes).toBe(50);
  });

  it("matches on place, subject or statement, and finds nothing for words that match nothing", () => {
    expect(searchChecks(all, "insulin", now).fresh.map((r) => r.place)).toEqual(["Walgreens, Condado"]);
    expect(searchChecks(all, "condado", now).fresh).toHaveLength(1);
    expect(searchChecks(all, "zzzz qqqq", now)).toEqual({ fresh: [] });
    expect(searchChecks(all, "", now)).toEqual({ fresh: [] });
  });

  it("does not answer a clinic question with a pharmacy just because both are open", () => {
    expect(searchChecks(all, "clinic open sunday", now).fresh).toEqual([]);
    expect(searchChecks(all, "open", now).fresh).toEqual([]);
  });

  it("finds a check from a question in Spanish", () => {
    expect(searchChecks(all, "farmacia abierta santurce", now).fresh.map((r) => r.id)).toEqual(["a"]);
    expect(searchChecks(all, "aeropuerto linea", now).fresh).toEqual([]);
  });

  it("counts how many checks are fresh at a moment, without showing them", () => {
    expect(freshCount(all, now)).toBe(2);
    expect(freshCount(all, new Date("2026-11-19T23:00:00Z"))).toBe(0);
  });
});
