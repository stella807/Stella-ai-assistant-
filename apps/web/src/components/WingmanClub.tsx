import { useEffect, useState } from "react";
import { api } from "../api.ts";
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
      setError(e instanceof Error ? e.message : "Could not update your membership.");
    } finally {
      setBusy(false);
    }
  };

  const { thisMonth } = status;

  return (
    <section className="card stack">
      <div className="row-between">
        <div className="stack" style={{ gap: 2 }}>
          <h3>Wingman Club</h3>
          <p className="tiny muted" style={{ margin: 0 }}>
            One membership, one group experience a month — revealed, not chosen by any one member. The due moves
            with the pick: {money(thisMonth.duesCents)} this month for {thisMonth.experience.label.toLowerCase()}.
          </p>
        </div>
        {!status.isMember && (
          <button className="btn btn-sm btn-ghost" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide" : "See it"}
          </button>
        )}
      </div>

      {(expanded || status.isMember) && (
        <>
          <div className="card card-quiet stack" style={{ gap: 6 }}>
            <div className="row-between">
              <strong className="small">
                {thisMonth.experience.emoji} This month: {thisMonth.experience.label}
              </strong>
              <span className="charge-amount">{money(thisMonth.duesCents)}</span>
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              Negotiated group rate {money(thisMonth.experience.negotiatedPerPersonCents)}/person — retail alone
              runs {money(thisMonth.experience.retailPerPersonCents)}. The rest of this month's due is the club's
              flat desk fee.
            </p>
          </div>

          {status.duesCoveredBySafehubby && (
            <p className="tiny" style={{ margin: 0, color: "var(--accent-bright)" }}>
              Included with your Elite membership — Safehubby covers this due, the same way it covers your
              concierge physician's retainer. You are not billed for it separately.
            </p>
          )}

          <div className="stack" style={{ gap: 4 }}>
            <strong className="tiny" style={{ letterSpacing: "0.02em", textTransform: "uppercase", color: "var(--accent-bright)" }}>
              Every event includes
            </strong>
            {status.perks.map((p) => (
              <p key={p} className="tiny muted" style={{ margin: 0 }}>🥃 {p}</p>
            ))}
          </div>

          <p className="tiny muted" style={{ margin: 0 }}>
            {status.memberCount} member{status.memberCount === 1 ? "" : "s"} today
            {status.overheadCovered
              ? " — enough for the club's flat desk fee to clear what it costs to run, every month."
              : ` — the desk fee needs ${status.breakEvenMembers} members to clear what it costs to run; below that, the club still runs, on less margin.`}
          </p>

          <ul className="timeline">
            {status.disclosures.map((d) => (
              <li key={d}><span className="tiny muted">{d}</span></li>
            ))}
          </ul>

          <button className={`btn btn-block${status.isMember ? "" : " btn-primary"}`} disabled={busy} onClick={toggle}>
            {status.isMember ? "Leave the club" : "Join the club"}
          </button>

          {error && <div className="banner banner-danger">{error}</div>}
        </>
      )}
    </section>
  );
}
