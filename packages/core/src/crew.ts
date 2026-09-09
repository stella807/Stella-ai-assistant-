import type { Iso8601, TravelerId } from "./types.ts";

/**
 * A crew is one night out, shared by the people actually at the table.
 *
 * What a crew shares is deliberately narrow: drink counts, check-in state, and
 * who has got home. Not location — location stays behind an individual share
 * grant to a named guardian. A group chat where everyone can see everyone's
 * position all night is a different, worse product.
 *
 * Nothing here rewards drinking more. The crew view exists so a table notices
 * when someone is falling behind on check-ins or getting ahead on drinks.
 */

export interface CrewMember {
  travelerId: TravelerId;
  displayName: string;
  joinedAt: Iso8601;
  leftAt?: Iso8601;
  /** Members opt in to sharing counts; a member who opts out still appears. */
  sharesCount: boolean;
}

export interface Crew {
  id: string;
  name: string;
  /** Short code read aloud at the table. */
  joinCode: string;
  createdBy: TravelerId;
  createdAt: Iso8601;
  /** Crews are for one night and expire on their own. */
  expiresAt: Iso8601;
  members: CrewMember[];
}

export const MAX_CREW_SIZE = 12;
export const MAX_CREW_HOURS = 14;

export interface CreateCrewInput {
  id: string;
  name: string;
  joinCode: string;
  createdBy: TravelerId;
  displayName: string;
  now: Date;
  hours?: number;
}

export function createCrew(input: CreateCrewInput): Crew {
  const name = input.name.trim();
  if (!name) throw new Error("Give the crew a name.");
  if (name.length > 40) throw new Error("That crew name is too long.");
  const hours = input.hours ?? 10;
  if (hours <= 0 || hours > MAX_CREW_HOURS) {
    throw new Error(`A crew can run for up to ${MAX_CREW_HOURS} hours.`);
  }

  return {
    id: input.id,
    name,
    joinCode: input.joinCode,
    createdBy: input.createdBy,
    createdAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + hours * 3_600_000).toISOString(),
    members: [
      { travelerId: input.createdBy, displayName: input.displayName, joinedAt: input.now.toISOString(), sharesCount: true },
    ],
  };
}

export function isCrewActive(crew: Crew, now: Date): boolean {
  return new Date(crew.expiresAt).getTime() > now.getTime();
}

export function activeMembers(crew: Crew): CrewMember[] {
  return crew.members.filter((m) => !m.leftAt);
}

export function isMember(crew: Crew, travelerId: TravelerId): boolean {
  return activeMembers(crew).some((m) => m.travelerId === travelerId);
}

export function joinCrew(crew: Crew, travelerId: TravelerId, displayName: string, now: Date): Crew {
  if (!isCrewActive(crew, now)) throw new Error("That crew has wrapped up for the night.");

  const existing = crew.members.find((m) => m.travelerId === travelerId);
  // Rejoining after leaving is fine — people step out and come back.
  if (existing && !existing.leftAt) return crew;
  if (activeMembers(crew).length >= MAX_CREW_SIZE) {
    throw new Error(`A crew tops out at ${MAX_CREW_SIZE} people.`);
  }

  const member: CrewMember = { travelerId, displayName, joinedAt: now.toISOString(), sharesCount: true };
  return {
    ...crew,
    members: existing
      ? crew.members.map((m) => (m.travelerId === travelerId ? member : m))
      : [...crew.members, member],
  };
}

/** Leaving is unilateral and immediate. Nobody can hold you in a crew. */
export function leaveCrew(crew: Crew, travelerId: TravelerId, now: Date): Crew {
  return {
    ...crew,
    members: crew.members.map((m) =>
      m.travelerId === travelerId && !m.leftAt ? { ...m, leftAt: now.toISOString() } : m,
    ),
  };
}

export function setSharesCount(crew: Crew, travelerId: TravelerId, sharesCount: boolean): Crew {
  return {
    ...crew,
    members: crew.members.map((m) => (m.travelerId === travelerId ? { ...m, sharesCount } : m)),
  };
}

export type CrewMemberState = "steady" | "ahead" | "quiet" | "heading-home" | "home-safe";

export interface CrewMemberView {
  travelerId: TravelerId;
  displayName: string;
  /** Null when the member has opted out of sharing their count. */
  drinks: number | null;
  state: CrewMemberState;
  missedCheckIns: number;
}

export interface CrewMemberFacts {
  travelerId: TravelerId;
  drinks: number;
  missedCheckIns: number;
  nightStatus: "active" | "heading-home" | "home-safe" | "ended" | "none";
}

/**
 * "Ahead" is relative to the table, not an absolute limit — the useful signal
 * for a group is who is outpacing everyone else, which is the person most
 * likely to need a ride first.
 */
export const AHEAD_BY = 2;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function crewView(crew: Crew, facts: CrewMemberFacts[]): CrewMemberView[] {
  const byId = new Map(facts.map((f) => [f.travelerId, f]));
  const members = activeMembers(crew);
  const drinksFor = (id: TravelerId) => byId.get(id)?.drinks ?? 0;

  return members.map((m) => {
    const f = byId.get(m.travelerId);
    const drinks = drinksFor(m.travelerId);
    const missed = f?.missedCheckIns ?? 0;

    // Compared against the *rest* of the table, not against everyone including
    // themselves — otherwise in a two-person crew the leader sets the very bar
    // they are being measured against and can never read as ahead.
    //
    // Only members actually tracking a night count as comparison points. A
    // friend who is out and on zero drinks is a real data point; someone who
    // never opened the app is not, and counting their silence as a zero would
    // flag everyone else as ahead.
    const others = members
      .filter((o) => o.travelerId !== m.travelerId)
      .filter((o) => (byId.get(o.travelerId)?.nightStatus ?? "none") !== "none")
      .map((o) => drinksFor(o.travelerId));

    let state: CrewMemberState = "steady";
    if (f?.nightStatus === "home-safe" || f?.nightStatus === "ended") state = "home-safe";
    else if (f?.nightStatus === "heading-home") state = "heading-home";
    else if (missed > 0) state = "quiet";
    else if (others.length > 0 && drinks >= median(others) + AHEAD_BY) state = "ahead";

    return {
      travelerId: m.travelerId,
      displayName: m.displayName,
      drinks: m.sharesCount ? drinks : null,
      state,
      missedCheckIns: missed,
    };
  });
}

/** Everyone accounted for — the thing the table actually wants to know. */
export function everyoneHome(views: CrewMemberView[]): boolean {
  return views.length > 0 && views.every((v) => v.state === "home-safe");
}
