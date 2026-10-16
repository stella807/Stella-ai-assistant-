import { useEffect, useState } from "react";
import { conciergeCategoryLabel, type ConciergeTask, type PlanId } from "@safehubby/core";
import type { HiringTab } from "./HiringScreen.tsx";
import { api, type Account } from "../api.ts";
import { activeRequests, firstName, helpTabFor, homeActions } from "../app/home-actions.ts";
import { AssistantArt, DeskArt, ErrandArt, WingmanIcon } from "./art/Art.tsx";

const ACTION_ART: Record<string, () => JSX.Element> = {
  assistant: () => <AssistantArt />,
  errand: () => <ErrandArt />,
  ride: () => <img src="/img/suv.jpg" alt="" className="home-photo" width={64} height={96} />,
  desk: () => <DeskArt />,
};

/** Everything the owner has asked an assistant to be able to do, in one place. */
const ASSISTANT_CAN: { title: string; items: string[] }[] = [
  { title: "In person", items: [
    "Wait with someone who should not be alone — a parent in a hospital",
    "Check on someone in person and tell you how they are",
    "Hand-deliver to a room or a door, with a photo when it is done",
  ] },
  { title: "Errands", items: [
    "Grab a juice, a charger, a blanket — one thing, brought to you",
    "Run an errand: pharmacy, groceries, a pickup, a return",
    "Party and event supplies",
  ] },
  { title: "Book and buy", items: [
    "Flights, hotels, restaurant tables and tickets",
    "Private boats, jets and villas on Elite",
    "Paid from a card with a limit you set — never past it",
  ] },
  { title: "Getting around", items: [
    "Book a ride and tell you the price first",
    "Airport pickup, with the flight tracked",
    "Secure transport home",
  ] },
  { title: "At a desk", items: [
    "Appointments, reminders, calls and emails",
  ] },
  { title: "Staying in touch", items: [
    "Chat or voice message with your assistant",
    "Receipts and updates by text or email",
  ] },
];

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
  const [clubInvited, setClubInvited] = useState(false);
  useEffect(() => {
    api.clubStatus().then((s) => setClubInvited(s.invited)).catch(() => {});
    api.conciergeTasks().then((r) => setTasks(r.tasks)).catch(() => {});
  }, []);

  const running = activeRequests(tasks);
  const actions = homeActions(planId);
  const name = firstName(account.displayName);

  return (
    <div className="stack">
      <section className="home-cover" style={{ backgroundImage: "linear-gradient(180deg, rgba(10,14,26,.15) 0%, rgba(10,14,26,.92) 100%), url(/img/hero-luxury.jpg)" }}>
        <span className="tiny home-cover-kicker">Your personal assistant</span>
        <h2>{name ? `Hello, ${name}.` : "Hello."}</h2>
        <p className="small">Tell us what you need. We take care of it — in person, if you want someone there.</p>
      </section>

      {actions.some((a) => a.id === "assistant") && (
        <button className="home-speak" onClick={() => onOpenHelp("concierge")}>
          <AssistantArt />
          <span><strong>Speak with your assistant</strong><span className="tiny">A real person. Ask for anything.</span></span>
          <span className="chev">›</span>
        </button>
      )}

      {actions.length > 0 ? (
        <div className="home-tiles">
          {actions.filter((a) => a.id !== "assistant").map((a) => (
            <button key={a.id} className="home-tile" onClick={() => onOpenHelp(a.tab)}>
              <span className="home-tile-art">{ACTION_ART[a.id]?.()}</span>
              <strong>{a.title}</strong>
            </button>
          ))}
        </div>
      ) : null}

      {clubInvited && <button className="home-club" onClick={() => onOpenHelp("club")}
        style={{ backgroundImage: "linear-gradient(180deg, rgba(10,14,26,0) 55%, rgba(10,14,26,.8)), url(/img/wingman-bourbon-cigar.jpg)" }}>
        <WingmanIcon size={36} />
        <strong>Wingman Club</strong>
        <span className="tiny">By invitation — cigars, bourbon, events.</span>
      </button>}
      <details className="night-out assistant-can">
        <summary>Everything your assistant can do</summary>
        <div className="stack" style={{ gap: 12 }}>
          {ASSISTANT_CAN.map((g) => (
            <div key={g.title} className="stack" style={{ gap: 2 }}>
              <strong className="small">{g.title}</strong>
              <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>
                {g.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          ))}
          {clubInvited && (
            <div className="stack" style={{ gap: 2 }}>
              <strong className="small">For club members</strong>
              <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Arrange and book club events, tables and cars</li>
              </ul>
            </div>
          )}
        </div>
      </details>
      <button className="linklike tiny" style={{ alignSelf: "center" }} onClick={onOpenHow}>How it works</button>

      {!actions.some((a) => a.id === "assistant" || a.id === "errand") && (
        <div className="card card-quiet stack" style={{ gap: 8 }}>
          <strong className="small">Assistants start with Premium.</strong>
          <button className="btn btn-primary" onClick={onOpenPlans}>See the plans</button>
        </div>
      )}

      {running.length > 0 && (
        <section className="card stack" aria-label="In progress">
          <h3>In progress</h3>
          {running.map((t) => (
            <button key={t.id} className="home-running" onClick={() => onOpenHelp(helpTabFor(t.category))}>
              <span className="stack" style={{ gap: 2, textAlign: "left" }}>
                <strong className="small">{conciergeCategoryLabel(t.category)}</strong>
                <span className="tiny muted">
                  {t.onBehalfOf ? `For ${t.onBehalfOf.recipientName} · ` : ""}
                  {t.assistantName ? `${t.assistantName} is on it` : "On the job"}
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
