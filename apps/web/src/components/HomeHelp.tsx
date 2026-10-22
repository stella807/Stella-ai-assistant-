import { choiceLabel } from "../app/ask-copy.ts";
import { useLanguage } from "../i18n.tsx";
import { IconDice } from "./NavIcons.tsx";
import { useEffect, useState } from "react";
import { conciergeCategoryLabel, type ConciergeTask, type PlanId } from "@safehubby/core";
import type { HiringTab } from "./HiringScreen.tsx";
import { api, type Account } from "../api.ts";
import { activeRequests, firstName, helpTabFor, homeActions } from "../app/home-actions.ts";
import { AssistantArt, DeskArt, ErrandArt, WingmanIcon } from "./art/Art.tsx";

const ACTION_ART: Record<string, () => JSX.Element> = {
  assistant: () => <AssistantArt />,
  errand: () => <ErrandArt />,
  ride: () => (
    <span className="home-tile-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 20v-4l3-6h16l3 6v4" /><path d="M4 20h24v4H4z" /><circle cx="10" cy="24" r="2.2" /><circle cx="22" cy="24" r="2.2" /><path d="M9 15h14" />
      </svg>
    </span>
  ),
  desk: () => <DeskArt />,
};

/** The home screen's words, in both languages the app speaks. */
const COPY = {
  en: {
    kicker: "Your personal assistant", hello: (n: string) => (n ? `Hello, ${n}.` : "Hello."),
    lead: "Tell us what you need. We take care of it — in person, if you want someone there.",
    speak: "Speak with your assistant", speakSub: "A real person. Ask for anything.",
    ride: "Get a ride", games: "Games", club: "By invitation — cigars, bourbon, events.",
    canDo: "Everything your assistant can do", how: "How it works", inProgress: "In progress",
    onIt: (n?: string) => (n ? `${n} is on it` : "On the job"), forWho: (n: string) => `For ${n} · `,
    premium: "Assistants start with Premium.", seePlans: "See the plans",
    clubTitle: "For club members", clubItem: "Arrange and book club events, tables and cars",
    can: [
      { title: "In person", items: ["Wait with someone who should not be alone — a parent in a hospital", "Check on someone in person and tell you how they are", "Hand-deliver to a room or a door, with a photo when it is done"] },
      { title: "Errands", items: ["Grab a juice, a charger, a blanket — one thing, brought to you", "Run an errand: pharmacy, groceries, a pickup, a return", "Party and event supplies"] },
      { title: "Book and buy", items: ["Flights, hotels, restaurant tables and tickets", "Private boats, jets and villas on Elite", "Paid from a card with a limit you set — never past it"] },
      { title: "Getting around", items: ["Book a ride and tell you the price first", "Secure transport home"] },
      { title: "At a desk", items: ["Appointments, reminders, calls and emails"] },
      { title: "Staying in touch", items: ["Chat or voice message with your assistant", "Receipts and updates by text or email"] },
    ],
  },
  es: {
    kicker: "Tu asistente personal", hello: (n: string) => (n ? `Hola, ${n}.` : "Hola."),
    lead: "Dinos lo que necesitas. Nosotros nos encargamos — en persona, si quieres a alguien ahí.",
    speak: "Habla con tu asistente", speakSub: "Una persona real. Pide lo que sea.",
    ride: "Pide un viaje", games: "Juegos", club: "Por invitación — puros, bourbon, eventos.",
    canDo: "Todo lo que tu asistente puede hacer", how: "Cómo funciona", inProgress: "En curso",
    onIt: (n?: string) => (n ? `${n} se está encargando` : "En camino"), forWho: (n: string) => `Para ${n} · `,
    premium: "Los asistentes empiezan con Premium.", seePlans: "Ver los planes",
    clubTitle: "Para miembros del club", clubItem: "Organizar y reservar eventos, mesas y autos del club",
    can: [
      { title: "En persona", items: ["Acompañar a alguien que no debe estar solo — un familiar en el hospital", "Visitar a alguien en persona y contarte cómo está", "Entregar en mano en una habitación o puerta, con una foto al terminar"] },
      { title: "Mandados", items: ["Traer un jugo, un cargador, una cobija — una cosa, hasta ti", "Hacer un mandado: farmacia, compra, recoger o devolver algo", "Artículos para fiestas y eventos"] },
      { title: "Reservar y comprar", items: ["Vuelos, hoteles, mesas en restaurantes y boletos", "Botes privados, jets y villas con Elite", "Pagado con una tarjeta con el límite que tú pones — nunca más"] },
      { title: "Moverse", items: ["Reservar un viaje y decirte el precio primero", "Recogido en el aeropuerto, siguiendo el vuelo", "Transporte seguro a casa"] },
      { title: "Desde un escritorio", items: ["Citas, recordatorios, llamadas y correos"] },
      { title: "Siempre en contacto", items: ["Chat o mensaje de voz con tu asistente", "Recibos y avisos por texto o correo"] },
    ],
  },
} as const;

/**
 * The front door: who is on the job right now, and what to ask for next.
 *
 * Somebody who opens this is usually in the middle of something — waiting for
 * a juice to arrive, or for news from a parent's hospital room — so what is
 * already happening comes first, above the things they could start.
 */
export function HomeHelp({ account, onOpenHelp, onOpenPlans, onOpenHow, onOpenGames }: {
  account: Account;
  onOpenHelp: (tab: HiringTab) => void;
  onOpenPlans: () => void;
  onOpenHow: () => void;
  onOpenGames: () => void;
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
  const { language } = useLanguage();
  const c = COPY[language === "es" ? "es" : "en"];

  return (
    <div className="stack">
      <section className="home-cover" style={{ backgroundImage: "linear-gradient(180deg, rgba(10,14,26,.15) 0%, rgba(10,14,26,.92) 100%), url(/img/hero-luxury.jpg)" }}>
        <span className="tiny home-cover-kicker">{c.kicker}</span>
        <h2>{c.hello(name)}</h2>
        <p className="small">{c.lead}</p>
      </section>

      {actions.some((a) => a.id === "assistant") && (
        <button className="home-speak" onClick={() => onOpenHelp("concierge")}>
          <AssistantArt />
          <span><strong>{c.speak}</strong><span className="tiny">{c.speakSub}</span></span>
          <span className="chev">›</span>
        </button>
      )}

      {actions.length > 0 ? (
        <div className="home-tiles">
          {actions.filter((a) => a.id !== "assistant").map((a) => (
            <button key={a.id} className="home-tile" onClick={() => onOpenHelp(a.tab)}>
              <span className="home-tile-art">{ACTION_ART[a.id]?.()}</span>
              <strong>{a.id === "ride" ? c.ride : a.title}</strong>
            </button>
          ))}
          <button className="home-tile" onClick={onOpenGames}>
            <span className="home-tile-art home-tile-icon"><IconDice /></span>
            <strong>{c.games}</strong>
          </button>
        </div>
      ) : null}

      {clubInvited && <button className="home-club" onClick={() => onOpenHelp("club")}
        style={{ backgroundImage: "linear-gradient(180deg, rgba(10,14,26,0) 35%, rgba(10,14,26,.92)), url(/img/wingman-bourbon-cigar.jpg)" }}>
        <WingmanIcon size={36} />
        <strong>Wingman Club</strong>
        <span className="tiny">{c.club}</span>
      </button>}
      <details className="night-out assistant-can">
        <summary>{c.canDo}</summary>
        <div className="stack" style={{ gap: 12 }}>
          {c.can.map((g) => (
            <div key={g.title} className="stack" style={{ gap: 2 }}>
              <strong className="small">{g.title}</strong>
              <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>
                {g.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          ))}
          {clubInvited && (
            <div className="stack" style={{ gap: 2 }}>
              <strong className="small">{c.clubTitle}</strong>
              <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>{c.clubItem}</li>
              </ul>
            </div>
          )}
        </div>
      </details>
      <button className="linklike tiny" style={{ alignSelf: "center" }} onClick={onOpenHow}>{c.how}</button>

      {!actions.some((a) => a.id === "assistant" || a.id === "errand") && (
        <div className="card card-quiet stack" style={{ gap: 8 }}>
          <strong className="small">{c.premium}</strong>
          <button className="btn btn-primary" onClick={onOpenPlans}>{c.seePlans}</button>
        </div>
      )}

      {running.length > 0 && (
        <section className="card stack" aria-label="In progress">
          <h3>{c.inProgress}</h3>
          {running.map((t) => (
            <button key={t.id} className="home-running" onClick={() => onOpenHelp(helpTabFor(t.category))}>
              <span className="stack" style={{ gap: 2, textAlign: "left" }}>
                <strong className="small">{choiceLabel(t.category, conciergeCategoryLabel(t.category), language === "es" ? "es" : "en")}</strong>
                <span className="tiny muted">
                  {t.onBehalfOf ? c.forWho(t.onBehalfOf.recipientName) : ""}
                  {c.onIt(t.assistantName)}
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
