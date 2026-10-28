import { useEffect, useState } from "react";
import { CLUB_EXPERIENCES, CLUB_PREMIUM_CREDIT_CENTS, eventExtraCents } from "@safehubby/core";
import { api } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { money } from "../money.ts";
import { CigarArt, FlagArt } from "./CigarArt.tsx";
import { BourbonGlassArt, ParachuteArt } from "./art/Art.tsx";
import { StripeCheckoutForm } from "./StripeCheckoutForm.tsx";

/**
 * The Wingman Club: shown as its own folded section, the same treatment
 * `PlanPicker` gives the Elite ladder — a different product from the plan
 * you're on, not a fifth option in the same list. See wingman-club.ts for
 * the naming decision, the reveal mechanic, the perk included in every
 * event, and why the due moves with the month's pick instead of sitting at
 * one flat number.
 *
 * With Stripe live, joining is paid: the join button opens the same card form
 * the plans use, and membership starts when Stripe confirms the payment. Until
 * then, and for Elite (whose dues Safehubby covers), joining is free.
 */
export function WingmanClub() {
  const { t, language } = useLanguage();
  const es = language === "es";
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.clubStatus>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const load = () => api.clubStatus().then(setStatus).catch(() => {});
  useEffect(() => { void load(); }, []);

  // While the card form is open, notice the moment Stripe has confirmed the payment.
  useEffect(() => {
    if (!paying) return;
    const timer = setInterval(() => {
      api.clubStatus().then((s) => { setStatus(s); if (s.isMember) setPaying(false); }).catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [paying]);

  // By invitation: anyone not invited never sees that the club exists.
  if (!status || !status.invited) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (status.isMember) await api.leaveClub();
      else if (status.billing.needsPayment) { setPaying(true); setBusy(false); return; }
      else await api.joinClub();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("wingman.error"));
    } finally {
      setBusy(false);
    }
  };

  const { thisMonth } = status;

  return (
    <section className="wm-club" aria-label={t("wingman.title")}>
      <div className="wm-haze" aria-hidden="true"><i /><i /><i /></div>

      <div className="wm-eyebrow">{t("wingman.eyebrow")}</div>
      <h3 className="wm-title">{t("wingman.title")}</h3>
      <p className="wm-tagline">{t("wingman.tagline")}</p>

      <div className="wm-photo">
        <img src="/img/wingman-bourbon-cigar.jpg" alt={es ? "Un vaso de bourbon con hielo y un puro sobre un barril de roble" : "A glass of bourbon over ice and a cigar resting on an oak barrel"} width={1100} height={864} />
        <div className="wm-photo-haze" aria-hidden="true" />
      </div>
      <div className="wm-trio" aria-hidden="true">
        <div className="wm-pic"><BourbonGlassArt /><span>Bourbon</span></div>
        <div className="wm-pic wm-pic-sky"><ParachuteArt /><span>{es ? "El cielo" : "The sky"}</span></div>
        <div className="wm-pic"><FlagArt /><span>{es ? "Eventos" : "Events"}</span></div>
      </div>

      <div className="wm-month">
        <div className="wm-month-top">
          <div className="wm-badge" aria-hidden="true">{thisMonth.experience.emoji}</div>
          <div>
            <div className="wm-label">{t("wingman.nowTag")}</div>
            <h4>{thisMonth.experience.label}</h4>
          </div>
          <div className="wm-due">{money(thisMonth.duesCents)}<small>{t("wingman.perMonth")}</small></div>
        </div>
        <p className="tiny" style={{ margin: "12px 0 0", color: "var(--wm-soft)" }}>
          {t("wingman.negotiatedRate")
            .replace("{rate}", money(thisMonth.experience.negotiatedPerPersonCents))
            .replace("{retail}", money(thisMonth.experience.retailPerPersonCents))}
        </p>
        <p className="tiny" style={{ margin: "6px 0 0", color: "var(--wm-soft)" }}>
          {thisMonth.eventExtraCents === 0
            ? t("wingman.includedNote")
            : t("wingman.extraNote")
              .replace("{credit}", money(CLUB_PREMIUM_CREDIT_CENTS))
              .replace("{amount}", money(thisMonth.eventExtraCents))}
        </p>
      </div>

      <div className="wm-rot-title">{t("wingman.comingUp")}</div>
      <div className="wm-rail" role="list">
        {CLUB_EXPERIENCES.map((e, i) => (
          <div key={e.id} role="listitem" className={`wm-card${e.id === thisMonth.experience.id ? " now" : ""}`} style={{ ["--i" as string]: i }}>
            {e.id === thisMonth.experience.id && <span className="now-tag">{t("wingman.nowTag")}</span>}
            {e.id === "track-day" ? <FlagArt />
              : e.id === "cigar-night" ? <CigarArt className="cigar-mini" />
              : <span className="em" aria-hidden="true">{e.emoji}</span>}
            <b>{e.label}</b>
            <span className="p">{eventExtraCents(e, status.memberCount) === 0 ? t("wingman.included") : t("wingman.plusIfYouGo").replace("{amount}", money(eventExtraCents(e, status.memberCount)))}</span>
          </div>
        ))}
      </div>

      {status.duesCoveredBySafehubby && (
        <p className="tiny" style={{ margin: "4px 0 10px", color: "var(--wm-gold)" }}>{t("wingman.includedElite")}</p>
      )}

      <div className="wm-rot-title">{t("wingman.everyEventIncludes")}</div>
      <div className="wm-perks">
        {status.perks.map((p) => (
          <div key={p} className="wm-perk"><span className="ic" aria-hidden="true">🥃</span><span className="small">{p}</span></div>
        ))}
      </div>


      <ul className="wm-fine" style={{ paddingLeft: 18 }}>
        {status.disclosures.map((d) => <li key={d}>{d}</li>)}
      </ul>

      <button className={`wm-cta${status.isMember ? " leave" : ""}`} disabled={busy} onClick={toggle}>
        {status.isMember ? t("wingman.leave")
          : status.billing.needsPayment ? t("wingman.joinPaid").replace("{amount}", money(status.billing.monthlyCents))
          : t("wingman.join")}
      </button>
      {paying && !status.isMember && (
        <div style={{ marginTop: 12 }}>
          <p className="tiny" style={{ margin: "0 0 8px", color: "var(--wm-soft)" }}>{t("wingman.billedNote").replace("{amount}", money(status.billing.monthlyCents))}</p>
          <StripeCheckoutForm planId="wingman-club" cadence="monthly" club onClose={() => { setPaying(false); void load(); }} />
        </div>
      )}

      {error && <div className="banner banner-danger" style={{ marginTop: 12 }}>{error}</div>}
      {status.isMember && <ClubAsk />}
    </section>
  );
}

/** A member asks the club assistant for anything; the answer comes back here. */
function ClubAsk() {
  const es = useLanguage().language === "es";
  const STATUS: Record<string, string> = es
    ? { open: "pendiente", arranged: "organizado", declined: "no se pudo" }
    : { open: "open", arranged: "arranged", declined: "declined" };
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.clubRequests>>["requests"]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = () => api.clubRequests().then((r) => setRows(r.requests)).catch(() => {});
  useEffect(() => { void load(); }, []);
  const send = async () => {
    setError(null);
    try { await api.askClub(note); setNote(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : es ? "No se pudo enviar" : "Could not send that"); }
  };
  return (
    <div className="stack" style={{ marginTop: 16 }}>
      <div className="wm-rot-title">{es ? "Tu asistente del club" : "Your club assistant"}</div>
      <textarea aria-label={es ? "Pídele a tu asistente del club" : "Ask your club assistant"} rows={2} value={note}
        placeholder={es ? "Una mesa para seis, un carro al evento…" : "A table for six, a car to the event…"}
        onChange={(e) => setNote(e.target.value)} />
      <button className="wm-cta" disabled={!note.trim()} onClick={send}>{es ? "Pedir" : "Ask"}</button>
      {error && <div className="banner banner-danger">{error}</div>}
      {rows.map((r) => (
        <div key={r.id} className="small">
          {r.note} <span className="tiny muted">· {STATUS[r.status] ?? r.status}</span>
          {r.reply && <div className="tiny muted">{r.reply}</div>}
        </div>
      ))}
    </div>
  );
}
