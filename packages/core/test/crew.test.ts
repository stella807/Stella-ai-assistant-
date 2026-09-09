import { describe, expect, it } from "vitest";
import {
  MAX_CREW_SIZE, activeMembers, createCrew, crewView, everyoneHome, isCrewActive,
  isMember, joinCrew, leaveCrew, setSharesCount, type Crew, type CrewMemberFacts,
} from "../src/crew.ts";

const T0 = new Date("2026-01-01T20:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);

const crew = (): Crew =>
  createCrew({ id: "c1", name: "Friday", joinCode: "TAB-991", createdBy: "sam", displayName: "Sam", now: T0 });

const facts = (over: Partial<CrewMemberFacts> & { travelerId: string }): CrewMemberFacts => ({
  drinks: 0, missedCheckIns: 0, nightStatus: "active", ...over,
});

describe("creating a crew", () => {
  it("puts the creator in it", () => {
    const c = crew();
    expect(activeMembers(c)).toHaveLength(1);
    expect(isMember(c, "sam")).toBe(true);
  });

  it("needs a name and expires on its own", () => {
    expect(() => createCrew({ id: "c", name: "  ", joinCode: "X", createdBy: "s", displayName: "S", now: T0 })).toThrow();
    expect(isCrewActive(crew(), at(9))).toBe(true);
    expect(isCrewActive(crew(), at(11))).toBe(false);
  });

  it("refuses an absurd lifetime", () => {
    expect(() => createCrew({ id: "c", name: "N", joinCode: "X", createdBy: "s", displayName: "S", now: T0, hours: 48 })).toThrow();
  });
});

describe("joining and leaving", () => {
  it("adds a member", () => {
    const c = joinCrew(crew(), "jordan", "Jordan", at(1));
    expect(activeMembers(c)).toHaveLength(2);
  });

  it("is idempotent for someone already in", () => {
    const c = joinCrew(joinCrew(crew(), "jordan", "Jordan", at(1)), "jordan", "Jordan", at(2));
    expect(activeMembers(c)).toHaveLength(2);
  });

  it("lets someone leave unilaterally, and rejoin later", () => {
    let c = joinCrew(crew(), "jordan", "Jordan", at(1));
    c = leaveCrew(c, "jordan", at(2));
    expect(isMember(c, "jordan")).toBe(false);
    c = joinCrew(c, "jordan", "Jordan", at(3));
    expect(isMember(c, "jordan")).toBe(true);
    expect(activeMembers(c)).toHaveLength(2);
  });

  it("refuses joining a crew that has wrapped up", () => {
    expect(() => joinCrew(crew(), "jordan", "Jordan", at(12))).toThrow(/wrapped up/i);
  });

  it("caps the size", () => {
    let c = crew();
    for (let i = 0; i < MAX_CREW_SIZE - 1; i++) c = joinCrew(c, `p${i}`, `P${i}`, at(1));
    expect(activeMembers(c)).toHaveLength(MAX_CREW_SIZE);
    expect(() => joinCrew(c, "one-too-many", "X", at(1))).toThrow(/tops out/i);
  });
});

describe("the crew view", () => {
  const built = () => {
    let c = crew();
    c = joinCrew(c, "jordan", "Jordan", at(1));
    c = joinCrew(c, "riley", "Riley", at(1));
    return c;
  };

  it("flags whoever is well ahead of the table", () => {
    const view = crewView(built(), [
      facts({ travelerId: "sam", drinks: 2 }),
      facts({ travelerId: "jordan", drinks: 2 }),
      facts({ travelerId: "riley", drinks: 6 }),
    ]);
    expect(view.find((v) => v.travelerId === "riley")!.state).toBe("ahead");
    expect(view.find((v) => v.travelerId === "sam")!.state).toBe("steady");
  });

  it("flags whoever has gone quiet", () => {
    const view = crewView(built(), [
      facts({ travelerId: "sam", drinks: 2 }),
      facts({ travelerId: "jordan", drinks: 2, missedCheckIns: 1 }),
      facts({ travelerId: "riley", drinks: 2 }),
    ]);
    expect(view.find((v) => v.travelerId === "jordan")!.state).toBe("quiet");
  });

  it("shows getting home over everything else", () => {
    const view = crewView(built(), [
      facts({ travelerId: "sam", drinks: 9, nightStatus: "home-safe" }),
      facts({ travelerId: "jordan", drinks: 2, nightStatus: "heading-home" }),
      facts({ travelerId: "riley", drinks: 2 }),
    ]);
    expect(view.find((v) => v.travelerId === "sam")!.state).toBe("home-safe");
    expect(view.find((v) => v.travelerId === "jordan")!.state).toBe("heading-home");
  });

  it("hides the count for a member who opted out, but keeps them visible", () => {
    const c = setSharesCount(built(), "riley", false);
    const view = crewView(c, [
      facts({ travelerId: "sam", drinks: 2 }),
      facts({ travelerId: "jordan", drinks: 2 }),
      facts({ travelerId: "riley", drinks: 7 }),
    ]);
    const riley = view.find((v) => v.travelerId === "riley")!;
    expect(riley.drinks).toBeNull();
    expect(riley.displayName).toBe("Riley");
  });

  it("drops members who left", () => {
    const c = leaveCrew(built(), "riley", at(2));
    expect(crewView(c, []).map((v) => v.travelerId)).toEqual(["sam", "jordan"]);
  });

  it("knows when everyone is accounted for", () => {
    const home = crewView(built(), [
      facts({ travelerId: "sam", nightStatus: "home-safe" }),
      facts({ travelerId: "jordan", nightStatus: "home-safe" }),
      facts({ travelerId: "riley", nightStatus: "ended" }),
    ]);
    expect(everyoneHome(home)).toBe(true);
    expect(everyoneHome([])).toBe(false);
  });
});

describe("ahead-of-the-table comparison", () => {
  it("works in a two-person crew, where the leader must not set their own bar", () => {
    const c = joinCrew(crew(), "jordan", "Jordan", at(1));
    const view = crewView(c, [
      facts({ travelerId: "sam", drinks: 4 }),
      facts({ travelerId: "jordan", drinks: 1 }),
    ]);
    expect(view.find((v) => v.travelerId === "sam")!.state).toBe("ahead");
    expect(view.find((v) => v.travelerId === "jordan")!.state).toBe("steady");
  });

  it("says nothing when the table is level", () => {
    const c = joinCrew(crew(), "jordan", "Jordan", at(1));
    const view = crewView(c, [
      facts({ travelerId: "sam", drinks: 3 }),
      facts({ travelerId: "jordan", drinks: 3 }),
    ]);
    expect(view.every((v) => v.state === "steady")).toBe(true);
  });

  it("stays quiet for a lone member with nobody to compare against", () => {
    expect(crewView(crew(), [facts({ travelerId: "sam", drinks: 9 })])[0]!.state).toBe("steady");
  });

  it("ignores members who have not started drinking", () => {
    const c = joinCrew(joinCrew(crew(), "jordan", "Jordan", at(1)), "riley", "Riley", at(1));
    const view = crewView(c, [
      facts({ travelerId: "sam", drinks: 3 }),
      facts({ travelerId: "jordan", drinks: 3 }),
      facts({ travelerId: "riley", drinks: 0, nightStatus: "none" }),
    ]);
    expect(view.find((v) => v.travelerId === "sam")!.state).toBe("steady");
  });
});

describe("who counts as a comparison point", () => {
  it("counts a friend who is tracking a night but not drinking", () => {
    const c = joinCrew(crew(), "jordan", "Jordan", at(1));
    const view = crewView(c, [
      facts({ travelerId: "sam", drinks: 5 }),
      facts({ travelerId: "jordan", drinks: 0, nightStatus: "active" }),
    ]);
    expect(view.find((v) => v.travelerId === "sam")!.state).toBe("ahead");
  });

  it("does not count someone who never started a night", () => {
    const c = joinCrew(crew(), "jordan", "Jordan", at(1));
    const view = crewView(c, [
      facts({ travelerId: "sam", drinks: 5 }),
      facts({ travelerId: "jordan", drinks: 0, nightStatus: "none" }),
    ]);
    expect(view.find((v) => v.travelerId === "sam")!.state).toBe("steady");
  });
});
