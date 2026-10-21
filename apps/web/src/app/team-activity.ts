import type { TeamEventKind, TeamMemberStatus } from "@safehubby/core";

export const TEAM_STATUS_LABEL: Record<TeamMemberStatus, string> = {
  "on-job": "On a job", available: "Available", "off-roster": "Off roster",
};

export const TEAM_STATUS_PILL: Record<TeamMemberStatus, string> = {
  "on-job": "pill pill-warn", available: "pill pill-safe", "off-roster": "pill",
};

export const TEAM_EVENT_LABEL: Record<TeamEventKind, string> = {
  assigned: "was assigned", "handed-to-runner": "was handed", "purchase-requested": "asked to buy",
  "purchase-approved": "was approved to buy", "purchase-declined": "was declined for",
  completed: "completed", declined: "declined", canceled: "had canceled",
  "pickup-coordinated": "was sent on a", "pickup-completed": "completed a",
};

/** "5 min ago", "3 h ago", "2 d ago" — the portal reads recency, not timestamps. */
export function timeAgo(iso: string, now: Date): string {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
