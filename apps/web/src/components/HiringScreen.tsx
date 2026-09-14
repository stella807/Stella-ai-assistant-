import { useState } from "react";
import { QUICK_TASK_MAX_CAP_CENTS } from "@safehubby/core";
import { ConciergePanel, type HiringKind } from "./ConciergePanel.tsx";
import { DeskTasksPanel } from "./DeskTasksPanel.tsx";
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
type Tab = HiringKind | "desk";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  {
    id: "desk",
    label: "Ask an assistant",
    blurb: "Appointments, reminders, emails, admin — the half of the job that happens at a desk. Included in your plan, with nothing to set and nothing to agree to.",
  },
  {
    id: "errand",
    label: "Small errands",
    blurb: `Something short and specific — grab one thing, run one errand. Lower rate, and a cap of up to $${QUICK_TASK_MAX_CAP_CENTS / 100} so "quick" stays quick.`,
  },
  {
    id: "concierge",
    label: "Concierge",
    blurb: "A personal assistant: wait with a friend who should not be alone, check on someone in person, or book and buy something for you — tickets, a hotel, a table — on a card funded from your account.",
  },
];

export function HiringScreen({ account }: { account: Account }) {
  // The desk tab first: it is the one most people will use most weeks,
  // and it costs nothing, so it should not be the one they have to find.
  const [kind, setKind] = useState<Tab>("desk");
  const active = TABS.find((t) => t.id === kind) ?? TABS[0]!;

  return (
    <div className="stack">
      <div>
        <h2>Hiring</h2>
        <p className="small muted">
          A vetted assistant for one bounded task, at a spend cap you set that's never exceeded.
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="What you need">
        {TABS.map((tab) => (
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
        : <ConciergePanel key={kind} account={account} kind={kind} />}
    </div>
  );
}
