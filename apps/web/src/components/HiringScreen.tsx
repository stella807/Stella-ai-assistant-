import { useEffect, useState } from "react";
import { isElitePlan, type PlanId } from "@safehubby/core";
import { ConciergePanel, type HiringKind } from "./ConciergePanel.tsx";
import { DeskTasksPanel } from "./DeskTasksPanel.tsx";
import { EliteDeskPanel } from "./EliteDeskPanel.tsx";
import { GetHomePanel } from "./GetHomePanel.tsx";
import { WingmanClub } from "./WingmanClub.tsx";
import { currentFix, type Fix } from "../native/location.ts";
import type { Account } from "../api.ts";

/**
 * Hiring someone, split into the two things people actually come here for.
 *
 * One list of four categories made a five-minute pickup and an hour of
 * sitting with a friend look like the same purchase, when they have different
 * rates, different spend caps, and different reasons to book. The split is
 * the one core already draws in `QUICK_TASK_CATEGORIES` rather than a new
 * distinction invented in the UI — see `HiringKind` in ConciergePanel.
 */
type Tab = HiringKind | "desk" | "ride" | "club" | "elite";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  {
    id: "desk",
    label: "Ask an assistant",
    blurb: "Appointments, reminders, emails, admin — the half of the job that happens at a desk. Included in your plan, with nothing to set and nothing to agree to.",
  },
  {
    id: "errand",
    label: "Small errands",
    blurb: "Something short and specific — grab one thing, run one errand. Lower rate, and a cap that stays low so \"quick\" stays quick — see the errand's own screen for the exact number on your plan.",
  },
  {
    id: "concierge",
    label: "Concierge",
    blurb: "A personal assistant: wait with a friend who should not be alone, check on someone in person, or book and buy something for you — tickets, a hotel, a table — on a card funded from your account.",
  },
  {
    id: "ride",
    label: "Get a ride",
    blurb: "Coordinated with a driver Safehubby actually hired, not a hand-off to Uber or Lyft — see the ride screen for how that works today.",
  },
  {
    id: "club",
    // Not a task any assistant does for you — a separate membership that
    // stacks on top of your plan. Kept off to the side rather than folded
    // into a concierge category for exactly that reason.
    label: "Wingman Club",
    blurb: "A monthly membership, not a task: one group experience a month, revealed for everyone at once, funded by the whole roster's dues rather than billed per person.",
  },
];

/**
 * Jet travel, yacht charter, villas, event production, hospitality, and a
 * concierge doctor — sold and priced on the Elite ladder, but not something
 * everyday plans should even see a tab for. Appended only for a member
 * actually on Elite, the same gate `requireElite` applies server-side.
 */
const ELITE_TAB: { id: Tab; label: string; blurb: string } = {
  id: "elite",
  label: "Elite desk",
  blurb: "Jet travel, yacht charter, villas, events and a concierge doctor — arranged by your assistant. You pay the supplier directly; Safehubby's commission is disclosed before you agree to anything.",
};

export function HiringScreen({ account }: { account: Account }) {
  const onElite = isElitePlan(account.planId as PlanId);
  const tabs = onElite ? [...TABS, ELITE_TAB] : TABS;

  // The desk tab first: it is the one most people will use most weeks,
  // and it costs nothing, so it should not be the one they have to find.
  const [kind, setKind] = useState<Tab>("desk");
  const active = tabs.find((t) => t.id === kind) ?? tabs[0]!;

  // Fetched once a ride is actually asked for, not on every visit to this
  // screen — the same "don't ask for a permission nobody has used yet" rule
  // TravelerScreen already follows for its own copy of this fix.
  const [fix, setFix] = useState<Fix | null>(null);
  useEffect(() => { if (kind === "ride") void currentFix().then(setFix); }, [kind]);

  return (
    <div className="stack">
      <div>
        <h2>Hiring</h2>
        <p className="small muted">
          A vetted assistant for one bounded task, at a spend cap you set that's never exceeded.
        </p>
      </div>

      <div className="tabs tabs-scroll" role="tablist" aria-label="What you need">
        {tabs.map((tab) => (
          <button key={tab.id} role="tab" aria-selected={kind === tab.id} onClick={() => setKind(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <p className="tiny muted" style={{ margin: 0 }}>{active.blurb}</p>

      {/* Keyed by tab so switching resets the form rather than carrying a
          half-filled concierge request into the errands screen. */}
      {kind === "desk"
        ? <DeskTasksPanel account={account} />
        : kind === "ride"
        ? <GetHomePanel pickup={fix} homeLabel={account.homeLabel || "home"} planId={account.planId as PlanId} />
        : kind === "club"
        ? <WingmanClub />
        : kind === "elite"
        ? <EliteDeskPanel />
        : <ConciergePanel key={kind} account={account} kind={kind} />}
    </div>
  );
}
