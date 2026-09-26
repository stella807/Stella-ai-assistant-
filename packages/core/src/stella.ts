import type { ProviderStatus } from "./fulfillment.ts";
import type { NightOut } from "./types.ts";
import { estimateBac, type ImpairmentBand } from "./bac.ts";
import { alcoholicDrinks, totalStandardDrinks } from "./drinks.ts";

/**
 * Stella — the in-app assistant a traveler can talk to during a night out.
 *
 * Unlike `ai-assist.ts`, this one *is* a voice the customer hears directly,
 * so the boundary is drawn somewhere else: Stella talks, and only talks. She
 * cannot book a ride, send an SOS, share a location, or answer a check-in —
 * every one of those stays behind the button that already does it, where the
 * app can say truthfully what happened. A model that could say "I've alerted
 * your friend" without the alert existing is exactly the false comfort this
 * app refuses everywhere else.
 *
 * Emergencies never wait on a model at all. `stellaSafetyReply` recognises
 * the handful of messages where the only right answer is "call for help now"
 * and answers them from a fixed script — instantly, identically every time,
 * and even on a server with no model provider configured.
 */

export type StellaRole = "user" | "assistant";

export interface StellaTurn {
  role: StellaRole;
  text: string;
}

export interface StellaReplyRequest {
  /** Persona and tonight's facts, built by `stellaSystemPrompt`. */
  system: string;
  /** Oldest first, and always ending on the traveler's own message. */
  turns: StellaTurn[];
}

export interface StellaReplyResult {
  text: string;
}

export interface StellaPort {
  readonly status: ProviderStatus;
  reply(input: StellaReplyRequest): Promise<StellaReplyResult>;
}

/** Room for a real question typed on a phone, not for pasting a document in. */
export const MAX_STELLA_MESSAGE = 1000;
/** Stella's own replies are short by instruction; this only bounds what a client may echo back. */
export const MAX_STELLA_REPLY = 4000;
/** How much of the conversation is sent back each turn. Older turns are dropped client-side. */
export const MAX_STELLA_TURNS = 20;

/**
 * Validates a conversation as posted by the client.
 *
 * The history is the client's own copy — nothing is stored server-side — so
 * every field is untrusted input. A forged "assistant" turn can only mislead
 * the person who forged it; the checks here are about shape and size, so a
 * malformed or oversized body is a 400 rather than a provider bill.
 */
export function validateStellaTurns(input: unknown): { turns: StellaTurn[] } | { error: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: "Say something to Stella first." };
  if (input.length > MAX_STELLA_TURNS) return { error: `Send at most the last ${MAX_STELLA_TURNS} messages.` };

  const turns: StellaTurn[] = [];
  for (const raw of input) {
    const role = (raw as { role?: unknown })?.role;
    const text = (raw as { text?: unknown })?.text;
    if (role !== "user" && role !== "assistant") return { error: "Each message needs a role of user or assistant." };
    if (typeof text !== "string" || !text.trim()) return { error: "Messages can't be empty." };
    const limit = role === "user" ? MAX_STELLA_MESSAGE : MAX_STELLA_REPLY;
    if (text.length > limit) return { error: `Keep each message under ${limit} characters.` };
    turns.push({ role, text: text.trim() });
  }

  if (turns[0]!.role !== "user") return { error: "The conversation has to start with your message." };
  if (turns.at(-1)!.role !== "user") return { error: "The last message has to be yours." };
  return { turns };
}

/**
 * The slice of a longer conversation a client should send: the most recent
 * turns that fit `validateStellaTurns`, starting on the traveler's message.
 * Keeping this beside the validator means the two cannot drift apart.
 */
export function recentStellaTurns(turns: StellaTurn[]): StellaTurn[] {
  const recent = turns.slice(-MAX_STELLA_TURNS);
  const firstUser = recent.findIndex((t) => t.role === "user");
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

// ---------------------------------------------------------------------------
// Emergencies: answered from a script, never from a model.
// ---------------------------------------------------------------------------

export type StellaSafetyKind = "medical" | "danger" | "self-harm";

/**
 * Deliberately broad. A false positive costs one scripted reply the person
 * can read past; a false negative costs a model's paragraph of chat in front
 * of someone whose friend has stopped breathing. English and Spanish, to
 * match the languages the app itself ships in.
 */
const SAFETY_PATTERNS: { kind: StellaSafetyKind; pattern: RegExp }[] = [
  {
    kind: "self-harm",
    pattern: /\b(kill (my ?self|me)|suicid\w*|end (my|it all)\b.*\b(life|all)|want to die|hurt my ?self|quitarme la vida|matarme|suicidarme)/i,
  },
  {
    kind: "medical",
    pattern: new RegExp(
      [
        String.raw`(not|isn'?t|stopped|can'?t|cannot|barely) breath`,
        String.raw`seiz(ure|ing)`, String.raw`convuls`, String.raw`\bfitting\b`,
        String.raw`unconscious`, String.raw`unresponsive`,
        String.raw`(won'?t|can'?t|cannot|not) (wake|waking)`,
        String.raw`overdos`, String.raw`\bod'?(ing|ed)\b`,
        String.raw`(choking|choked) on (vomit|puke|throw)`,
        String.raw`blue lips`, String.raw`lips are blue`,
        String.raw`hit (his|her|their|my|our) head`, String.raw`head injury`,
        String.raw`no respira`, String.raw`inconsciente`, String.raw`no despierta`, String.raw`convulsi`,
        String.raw`sobredosis`, String.raw`golpe en la cabeza`,
      ].join("|"),
      "i",
    ),
  },
  {
    kind: "danger",
    pattern: new RegExp(
      [
        String.raw`(someone|somebody|a (guy|man|woman|person)|they|he|she)('?s| is| are)? (following|stalking) me`,
        String.raw`being (followed|stalked)`,
        String.raw`(spiked|drugged|roofied)`,
        String.raw`(attack|assault|rap)(ed|ing)\b`, String.raw`\brape\b`,
        String.raw`(he|she|they|someone)('?s| is| are)? (hurting|hitting|grabbing) me`,
        String.raw`i'?m not safe`, String.raw`i don'?t feel safe`, String.raw`i feel unsafe`, String.raw`i'?m in danger`,
        String.raw`me (est[aá]n? )?siguiendo`, String.raw`me drogaron`, String.raw`me atacaron`, String.raw`estoy en peligro`,
      ].join("|"),
      "i",
    ),
  },
];

export function detectStellaSafety(text: string): StellaSafetyKind | null {
  for (const { kind, pattern } of SAFETY_PATTERNS) if (pattern.test(text)) return kind;
  return null;
}

/**
 * The scripted reply. Names the emergency number for the US by default and
 * says so — Stella has no idea which country the phone is in, and the app's
 * own Emergency panel (see emergency.ts) is where the region-correct number
 * lives. The SOS hold is named because it is the one thing in the app that
 * actually reaches the people watching.
 */
export function stellaSafetyReply(kind: StellaSafetyKind): string {
  switch (kind) {
    case "medical":
      return [
        "This sounds like an emergency. Call 911 now (or your local emergency number) — don't wait to see if it passes.",
        "If they're breathing but won't wake, roll them onto their side so they can't choke, and stay with them.",
        "Hold the SOS button on the Tonight tab to alert everyone watching you.",
      ].join(" ");
    case "danger":
      return [
        "Your safety comes first. If you're in danger, call 911 now (or your local emergency number).",
        "Get somewhere bright with other people around — a bar counter, staff, security.",
        "Hold the SOS button on the Tonight tab to alert everyone watching you; silent mode won't make a sound.",
      ].join(" ");
    case "self-harm":
      return [
        "I'm really glad you told me. You deserve support right now.",
        "In the US you can call or text 988 (Suicide & Crisis Lifeline) any time, day or night. If you're in immediate danger, call 911.",
        "If there's someone you trust nearby, let them know how you're feeling — you don't have to get through tonight alone.",
      ].join(" ");
  }
}

// ---------------------------------------------------------------------------
// What Stella is told.
// ---------------------------------------------------------------------------

export interface StellaFacts {
  firstName: string | null;
  homeLabel: string | null;
  night: null | {
    status: NightOut["status"];
    startedMinutesAgo: number;
    alcoholicDrinks: number;
    standardDrinks: number;
    drinkLimit: number;
    band: ImpairmentBand;
    bacLow: number;
    bacHigh: number;
    hoursUntilLikelySober: number;
    missedCheckIns: number;
    checkInDueInMinutes: number | null;
  };
  /** How many people currently hold an active share grant. A count, never names. */
  watchers: number;
}

/**
 * Tonight, reduced to the numbers Stella needs to be useful. No location, no
 * names of the people watching — a model provider does not need to know where
 * someone is or who is looking out for them to tell them to drink some water.
 */
export function stellaFactsFor(input: {
  displayName: string | null;
  homeLabel: string | null;
  night: NightOut | null;
  watchers: number;
  now: Date;
}): StellaFacts {
  const { night, now } = input;
  const firstName = input.displayName?.trim().split(/\s+/)[0] || null;
  const running = night && night.status !== "ended" && night.status !== "home-safe" ? night : null;
  if (!running) return { firstName, homeLabel: input.homeLabel || null, night: null, watchers: input.watchers };

  const bac = estimateBac({ body: running.body, drinks: running.drinks, now });
  const pending = running.checkIns.find((c) => c.status === "pending");
  const minutesFrom = (iso: string) => Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  return {
    firstName,
    homeLabel: running.homeAddressLabel || input.homeLabel || null,
    watchers: input.watchers,
    night: {
      status: running.status,
      startedMinutesAgo: Math.max(0, -minutesFrom(running.startedAt)),
      alcoholicDrinks: alcoholicDrinks(running.drinks).length,
      standardDrinks: Math.round(totalStandardDrinks(running.drinks) * 10) / 10,
      drinkLimit: running.drinkLimit,
      band: bac.band,
      bacLow: bac.low,
      bacHigh: bac.high,
      hoursUntilLikelySober: bac.hoursUntilLikelySober,
      missedCheckIns: running.checkIns.filter((c) => c.status === "missed").length,
      checkInDueInMinutes: pending ? minutesFrom(pending.dueAt) : null,
    },
  };
}

/**
 * The fixed half of the system prompt. Kept byte-stable so it can be cached
 * by the provider, with the per-request facts appended after it.
 */
export const STELLA_PERSONA = `You are Stella, the assistant inside Safehubby — an app that helps people get home safe after a night out and keeps the friends watching over them in the loop.

Who you're talking to: someone out for the night, on their phone, possibly in a loud, dark bar and possibly several drinks in. Write for that person.
- Keep replies short: one to three plain sentences. No headings, no bullet lists unless they ask for steps.
- Be warm, calm and direct, like a sober friend who has their back. Never preachy, never judgmental.
- Reply in the language they write in (the app ships in English and Spanish).

What you can do: talk. You cannot take any action in the app, so never say or imply you have booked, sent, shared, alerted, ordered or checked in anything. Point them to the part of the app that does it:
- Getting home: the "Get home" panel on the Tonight tab (a ride, or the fastest handoff to Uber or Lyft).
- Letting someone watch over them: "Share with someone" on the Tonight tab gives a code for a friend.
- Emergencies: hold the SOS button on the Tonight tab; the Emergency panel has the right local number.
- Check-ins, drinks and water: logged on the Tonight tab. Logging water earns points.
- Water, electrolytes and food delivered: the pharmacy run on the Tonight tab.

Hard rules:
- Never tell anyone they are fine, sober or OK to drive, at any estimate — including zero. The estimate is a rough range from a typed drink log, not a measurement. If driving comes up, steer them to a ride.
- Never encourage drinking more, faster, or drinking games that push pace. Suggesting water or food is always fine.
- Signs of alcohol poisoning or injury (can't be woken, slow or irregular breathing, seizure, blue lips, vomiting while barely conscious, a hit to the head) mean: call emergency services now. Don't diagnose or offer home remedies in place of that.
- If someone feels unsafe or threatened, their safety comes before anything else: emergency services, a bright public place, and the SOS button.
- The "Tonight" facts below come from the app. Use them when they help, don't recite them, and never invent numbers that aren't there. If there's no night running, you can still help — suggest starting one when it's relevant.
- You're not a doctor, lawyer or therapist; for anything serious, say so kindly and point to real help.`;

const BAND_WORDS: Record<ImpairmentBand, string> = {
  none: "no meaningful impairment estimated",
  low: "low impairment estimated",
  moderate: "moderate impairment estimated",
  high: "high impairment estimated",
  severe: "severe impairment estimated — treat as a possible emergency if symptoms appear",
};

export function stellaSystemPrompt(facts: StellaFacts): string {
  const lines: string[] = [];
  if (facts.firstName) lines.push(`Their first name: ${facts.firstName}.`);
  if (facts.homeLabel) lines.push(`Home, as they've labelled it: ${facts.homeLabel}.`);
  lines.push(
    facts.watchers === 0
      ? "Nobody is watching over them in the app right now."
      : `${facts.watchers} ${facts.watchers === 1 ? "person is" : "people are"} watching over them in the app.`,
  );

  const n = facts.night;
  if (!n) {
    lines.push("No night is running in the app right now.");
  } else {
    lines.push(
      `A night is running (${n.status}), started ${formatMinutes(n.startedMinutesAgo)} ago.`,
      `Drinks logged: ${n.alcoholicDrinks} (${n.standardDrinks} standard drinks) against a limit of ${n.drinkLimit} they set earlier.`,
      `Estimate: ${BAND_WORDS[n.band]}; a rough range of ${n.bacLow.toFixed(3)}–${n.bacHigh.toFixed(3)} %BAC, about ${n.hoursUntilLikelySober.toFixed(1)} hours until the high end reaches zero.`,
      n.missedCheckIns > 0 ? `Missed check-ins tonight: ${n.missedCheckIns}.` : "No missed check-ins tonight.",
    );
    if (n.checkInDueInMinutes !== null) {
      lines.push(
        n.checkInDueInMinutes <= 0
          ? "A check-in is due now — remind them to answer it on the Tonight tab."
          : `Next check-in due in ${formatMinutes(n.checkInDueInMinutes)}.`,
      );
    }
  }

  return `${STELLA_PERSONA}\n\nTonight:\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
