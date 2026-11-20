import { createHash } from "node:crypto";

/**
 * One free live answer a day for each asker, so an agent can see what it would pay for before it pays. Kept in memory
 * only: a restart just gives everyone their try again, which costs nothing that matters. The asker is kept as a salted
 * fingerprint, never as an address, and everything is forgotten when the day changes.
 */
const PR_OFFSET_MS = 4 * 60 * 60_000; // Puerto Rico is UTC-4 all year.

const prDay = (now: Date) => new Date(now.getTime() - PR_OFFSET_MS).toISOString().slice(0, 10);
/** When the next free answer can be had: the next midnight in Puerto Rico. */
export const nextFreeAt = (now: Date) => new Date(Date.parse(`${prDay(now)}T00:00:00Z`) + 24 * 60 * 60_000 + PR_OFFSET_MS).toISOString();

/** Off unless the owner switches it on (FREE_SAMPLES=on in Railway): the owner chose on 2026-11-20 to charge for every answer. */
export const freeSamplesOn = () => /^(1|true|on|yes)$/i.test(process.env.FREE_SAMPLES?.trim() ?? "");

export type SampleVerdict = { ok: true } | { ok: false; reason: "used" | "full"; nextFreeAt: string };

export class FreeSamples {
  #day = "";
  #salt = "";
  #used = new Set<string>();
  readonly perDay: number;

  /** `perDay` is the most free answers given in one day, to everyone together. */
  constructor(perDay = 100) {
    this.perDay = perDay;
  }

  #roll(now: Date) {
    const day = prDay(now);
    if (day === this.#day) return;
    this.#day = day;
    this.#salt = createHash("sha256").update(`${day}:${Math.random()}`).digest("hex");
    this.#used.clear();
  }

  #mark(asker: string) {
    return createHash("sha256").update(`${this.#salt}:${asker}`).digest("hex").slice(0, 32);
  }

  take(asker: string, now: Date): SampleVerdict {
    this.#roll(now);
    const mark = this.#mark(asker);
    if (this.#used.has(mark)) return { ok: false, reason: "used", nextFreeAt: nextFreeAt(now) };
    if (this.#used.size >= this.perDay) return { ok: false, reason: "full", nextFreeAt: nextFreeAt(now) };
    this.#used.add(mark);
    return { ok: true };
  }

  /** Gives the try back: for a question with no answer, the free try is not used up. */
  release(asker: string, now: Date): void {
    this.#roll(now);
    this.#used.delete(this.#mark(asker));
  }
}
