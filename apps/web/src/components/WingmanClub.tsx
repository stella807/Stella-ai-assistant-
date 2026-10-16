import { useEffect, useState } from "react";
import { CLUB_EXPERIENCES, duesForCents } from "@safehubby/core";
import { api } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { money } from "../money.ts";
import { CigarArt, FlagArt } from "./CigarArt.tsx";
import { BourbonGlassArt, ParachuteArt } from "./art/Art.tsx";

/**
 * The Wingman Club: shown as its own folded section, the same treatment
 * `PlanPicker` gives the Elite ladder — a different product from the plan
 * you're on, not a fifth option in the same list. See wingman-club.ts for
 * the naming decision, the reveal mechanic, the perk included in every
 * event, and why the due moves with the month's pick instead of sitting at
 * one flat number.
 *
 * There is deliberately no charge wired to the join button yet — see the
 * doc on `clubMember` in the API's store.ts. Joining changes the roster
 * count this screen shows honestly; it does not move any money.
 */
export function WingmanClub() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.clubStatus>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.clubStatus().then(setStatus).catch(() => {});
  useEffect(() => { void load(); }, []);

  if (!status) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (status.isMember) await api.leaveClub();
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

      <div className="wm-hero"><CigarArt /></div>
      <div className="wm-trio" aria-hidden="true">
        <div className="wm-pic"><BourbonGlassArt /><span>Bourbon</span></div>
        <div className="wm-pic wm-pic-sky"><ParachuteArt /><span>The sky</span></div>
        <div className="wm-pic"><FlagArt /><span>The track</span></div>
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
            <span className="p">{money(duesForCents(e))}</span>
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

      <p className="wm-fine" style={{ marginTop: 16 }}>
        {t(status.memberCount === 1 ? "wingman.memberCountOne" : "wingman.memberCountMany").replace("{count}", String(status.memberCount))}
        {" — "}
        {status.overheadCovered
          ? t("wingman.overheadCovered")
          : t("wingman.overheadNotCovered").replace("{n}", String(status.breakEvenMembers))}
      </p>

      <ul className="wm-fine" style={{ paddingLeft: 18 }}>
        {status.disclosures.map((d) => <li key={d}>{d}</li>)}
      </ul>

      <button className={`wm-cta${status.isMember ? " leave" : ""}`} disabled={busy} onClick={toggle}>
        {status.isMember ? t("wingman.leave") : t("wingman.join")}
      </button>

      {error && <div className="banner banner-danger" style={{ marginTop: 12 }}>{error}</div>}
    </section>
  );
}
