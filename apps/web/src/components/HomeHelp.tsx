import { useEffect, useState } from "react";
import { conciergeCategoryLabel, type ConciergeTask, type PlanId } from "@safehubby/core";
import type { HiringTab } from "./HiringScreen.tsx";
import { api, type Account } from "../api.ts";
import { activeRequests, firstName, helpTabFor, homeActions } from "../app/home-actions.ts";
import { money } from "../money.ts";
import { AssistantArt, DeskArt, ErrandArt, RideArt, WingmanIcon } from "./art/Art.tsx";

const ACTION_ART: Record<string, () => JSX.Element> = {
  assistant: () => <AssistantArt />,
  errand: () => <ErrandArt />,
  ride: () => <RideArt />,
  desk: () => <DeskArt />,
};

/**
 * The front door: who is on the job right now, and what to ask for next.
 *
 * Somebody who opens this is usually in the middle of something — waiting for
 * a juice to arrive, or for news from a parent's hospital room — so what is
 * already happening comes first, above the things they could start.
 */
export function HomeHelp({ account, onOpenHelp, onOpenPlans, onOpenHow }: {
  account: Account;
  onOpenHelp: (tab: HiringTab) => void;
  onOpenPlans: () => void;
  onOpenHow: () => void;
}) {
  const planId = account.planId as PlanId;
  const [tasks, setTasks] = useState<ConciergeTask[]>([]);
  useEffect(() => {
    api.conciergeTasks().then((r) => setTasks(r.tasks)).catch(() => {});
  }, []);

  const running = activeRequests(tasks);
  const actions = homeActions(planId);
  const name = firstName(account.displayName);

  return (
    <div className="stack">
      <section className="card stack home-hero">
        <div>
          <h2>{name ? `Hi ${name}, how can we help?` : "How can we help?"}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            A vetted person for one thing, or one afternoon. You set a limit, and you are never charged past it.
          </p>
        </div>

        {actions.length > 0 ? (
          <div className="home-actions">
            {actions.map((a) => (
              <button key={a.id} className="home-action" onClick={() => onOpenHelp(a.tab)}>
                <span className="home-action-art">{ACTION_ART[a.id]?.()}</span>
                <strong>{a.title}</strong>
                <span className="tiny muted">{a.hint}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="home-extras">
          <button className="home-extra home-extra-club" onClick={() => onOpenHelp("club")}>
            <WingmanIcon size={44} />
            <span><strong>Wingman Club</strong><span className="tiny muted">One evening a month, arranged — cigars, bourbon, the track.</span></span>
          </button>
          <button className="home-extra" onClick={onOpenHow}>
            <span className="home-extra-mark">?</span>
            <span><strong>How it works</strong><span className="tiny muted">What it costs, plan by plan, and who does what.</span></span>
          </button>
        </div>

        {/* An account with no paid plan has no assistants or errands to offer.
            Say where they start, rather than showing doors that are locked. */}
        {!actions.some((a) => a.id === "assistant" || a.id === "errand") && (
          <div className="card card-quiet stack" style={{ gap: 8 }}>
            <strong className="small">Assistants and errands start with Premium.</strong>
            <span className="tiny muted">
              Check-ins, location sharing and SOS are always free. A paid plan adds a real person who comes to you.
            </span>
            <button className="btn btn-primary" onClick={onOpenPlans}>See the plans</button>
          </div>
        )}
      </section>

      {running.length > 0 && (
        <section className="card stack" aria-label="In progress">
          <h3>In progress</h3>
          {running.map((t) => (
            <button key={t.id} className="home-running" onClick={() => onOpenHelp(helpTabFor(t.category))}>
              <span className="stack" style={{ gap: 2, textAlign: "left" }}>
                <strong className="small">{conciergeCategoryLabel(t.category)}</strong>
                <span className="tiny muted">
                  {t.onBehalfOf ? `For ${t.onBehalfOf.recipientName} · ` : ""}
                  {t.assistantName ? `${t.assistantName} is on it` : "On the job"} · {money(t.spendCapCents + t.serviceFeeCents)} held
                </span>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
