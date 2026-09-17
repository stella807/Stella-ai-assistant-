import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { money } from "../money.ts";

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
  const [expanded, setExpanded] = useState(false);
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
    <section className="card stack">
      <div className="row-between">
        <div className="stack" style={{ gap: 2 }}>
          <h3>{t("wingman.title")}</h3>
          <p className="tiny muted" style={{ margin: 0 }}>
            {t("wingman.blurb")
              .replace("{amount}", money(thisMonth.duesCents))
              .replace("{experience}", thisMonth.experience.label.toLowerCase())}
          </p>
        </div>
        {!status.isMember && (
          <button className="btn btn-sm btn-ghost" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? t("wingman.hide") : t("wingman.seeIt")}
          </button>
        )}
      </div>

      {(expanded || status.isMember) && (
        <>
          <div className="card card-quiet stack" style={{ gap: 6 }}>
            <div className="row-between">
              <strong className="small">
                {thisMonth.experience.emoji} {t("wingman.thisMonth").replace("{label}", thisMonth.experience.label)}
              </strong>
              <span className="charge-amount">{money(thisMonth.duesCents)}</span>
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              {t("wingman.negotiatedRate")
                .replace("{rate}", money(thisMonth.experience.negotiatedPerPersonCents))
                .replace("{retail}", money(thisMonth.experience.retailPerPersonCents))}
            </p>
          </div>

          {status.duesCoveredBySafehubby && (
            <p className="tiny" style={{ margin: 0, color: "var(--accent-bright)" }}>
              {t("wingman.includedElite")}
            </p>
          )}

          <div className="stack" style={{ gap: 4 }}>
            <strong className="tiny" style={{ letterSpacing: "0.02em", textTransform: "uppercase", color: "var(--accent-bright)" }}>
              {t("wingman.everyEventIncludes")}
            </strong>
            {status.perks.map((p) => (
              <p key={p} className="tiny muted" style={{ margin: 0 }}>🥃 {p}</p>
            ))}
          </div>

          <p className="tiny muted" style={{ margin: 0 }}>
            {t(status.memberCount === 1 ? "wingman.memberCountOne" : "wingman.memberCountMany").replace("{count}", String(status.memberCount))}
            {" — "}
            {status.overheadCovered
              ? t("wingman.overheadCovered")
              : t("wingman.overheadNotCovered").replace("{n}", String(status.breakEvenMembers))}
          </p>

          <ul className="timeline">
            {status.disclosures.map((d) => (
              <li key={d}><span className="tiny muted">{d}</span></li>
            ))}
          </ul>

          <button className={`btn btn-block${status.isMember ? "" : " btn-primary"}`} disabled={busy} onClick={toggle}>
            {status.isMember ? t("wingman.leave") : t("wingman.join")}
          </button>

          {error && <div className="banner banner-danger">{error}</div>}
        </>
      )}
    </section>
  );
}
