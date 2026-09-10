import type { NightOut } from "./types.ts";

/**
 * Forgetting where people were.
 *
 * A night of location pings identifies a person, their local, their commute
 * and who they were with, and traces like that are notoriously re-identifiable
 * even with the names stripped. Encrypting them at rest answers "someone stole
 * the disk". It does not answer "why is a year of your movements still here at
 * all" — and the only real answer to that is to not have them.
 *
 * So the trace expires and the night does not. The drink log, the check-ins
 * and whether someone got home are the record they might want to look back on;
 * the breadcrumb trail is operational data that stops being useful the morning
 * after. Keeping the night while dropping the trail is the shape that serves
 * the user rather than the database.
 */

/** Stated, not implied. Long enough to review last weekend, short enough to be a window. */
export const LOCATION_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SweepResult {
  nights: NightOut[];
  /** How many pings were dropped, so the sweep can say what it did. */
  removed: number;
}

/**
 * Drops pings older than the window, leaving everything else about the night
 * intact.
 *
 * Pure and returning a count rather than logging, so the caller decides
 * whether a sweep that removed nothing is worth a line in the log.
 */
export function sweepLocationHistory(
  nights: NightOut[],
  now: Date,
  retentionDays = LOCATION_RETENTION_DAYS,
): SweepResult {
  const cutoff = now.getTime() - retentionDays * DAY_MS;
  let removed = 0;

  const swept = nights.map((night) => {
    const kept = night.pings.filter((p) => new Date(p.at).getTime() > cutoff);
    if (kept.length === night.pings.length) return night;
    removed += night.pings.length - kept.length;
    return { ...night, pings: kept };
  });

  return { nights: removed === 0 ? nights : swept, removed };
}
