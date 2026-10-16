import { hasFeature, type ConciergeCategory, type ConciergeTask, type Feature, type PlanId } from "@safehubby/core";
import type { HiringTab } from "../components/HiringScreen.tsx";

/**
 * What the home screen puts in front of somebody who has come for help.
 *
 * The home used to open on a night out — a drink limit and a weight — for a
 * product that is increasingly for somebody who wants a person to come to
 * them, or to a parent alone in a hospital. These are the doors in: each one
 * gated on the real `Feature`, so a button never leads to a padlock.
 */
export interface HomeAction {
  id: "assistant" | "errand" | "ride" | "desk";
  title: string;
  hint: string;
  tab: HiringTab;
  feature: Feature;
}

const ALL_ACTIONS: HomeAction[] = [
  {
    id: "assistant", tab: "concierge", feature: "personal-concierge",
    title: "Send an assistant",
    hint: "Stay with someone, check on them, or book and buy something for you.",
  },
  {
    id: "ride", tab: "ride", feature: "ride-booking",
    title: "Get a ride",
    hint: "We book it and tell you the price before it is confirmed.",
  },
];

/** The doors this plan can actually open, assistants first. */
export function homeActions(planId: PlanId): HomeAction[] {
  return ALL_ACTIONS.filter((a) => hasFeature(planId, a.feature));
}

/** The Help tab a running task belongs to, so "open it" lands where it lives. */
export function helpTabFor(category: ConciergeCategory): HiringTab {
  // Errands no longer have their own tab — your assistant takes them and
  // sends a runner — so every request opens in the same place.
  void category;
  return "concierge";
}

/** Requests still happening, newest first. */
export function activeRequests(tasks: ConciergeTask[]): ConciergeTask[] {
  return tasks
    .filter((t) => t.status === "in-progress")
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}
