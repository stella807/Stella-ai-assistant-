import { useEffect, useState } from "react";
import { api, type ClubDesk } from "../api.ts";

/**
 * The club assistant's desk — also the owner's. Who is invited, what members
 * have asked for, and a plain update on how the business is doing, so the
 * owner hears it from the assistant instead of going looking.
 */
export function ClubDeskSection() {
  const [desk, setDesk] = useState<ClubDesk | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const load = () => api.clubDesk().then(setDesk).catch((e) => setError(e instanceof Error ? e.message : "Could not load the club desk"));
  useEffect(() => { void load(); }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "That did not go through"); }
  };

  const [outing, setOuting] = useState<Awaited<ReturnType<typeof api.clubEvent>> | null>(null);
  useEffect(() => { api.clubEvent().then(setOuting).catch(() => {}); }, []);
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (!desk) return error ? <p className="tiny" role="alert">{error}</p> : null;
  const u = desk.update;
  const open = desk.requests.filter((r) => r.status === "open");

  return (
    <section className="card stack" aria-label="Club desk">
      <h3>Club desk</h3>
      <div className="card card-quiet stack" style={{ gap: 2 }}>
        <strong className="small">The business, today</strong>
        <span className="tiny muted">
          {u.customers} customers · {u.tasksInProgress} errands in progress · {u.tasksDoneThisWeek} finished this week · {u.pickupsWaiting} pickups waiting
        </span>
        <span className="tiny muted">{u.clubMembers} club members · {u.clubInvited} invited, not joined · {u.openClubRequests} requests open</span>
      </div>

      {outing && (
        <div className="card card-quiet stack" style={{ gap: 6 }}>
          <strong className="small">This month's outing: {outing.experience.emoji} {outing.experience.label}</strong>
          <span className="tiny muted">
            {outing.going.length} going{outing.totalExtraCents > 0 ? ` · ${dollars(outing.totalExtraCents)} charged for the day` : ""}
            {outing.canceled ? " · called off" : outing.locked ? " · locked in" : ""}
          </span>
          {outing.going.length > 0 && <span className="tiny">{outing.going.map((g) => g.name).join(", ")}</span>}
          {!outing.canceled && (
            <div className="row">
              <button className="btn btn-sm grow" disabled={outing.locked}
                onClick={() => void act(async () => { await api.clubEventLock(); setOuting(await api.clubEvent()); })}>
                Lock the day in
              </button>
              <button className="btn btn-sm btn-ghost grow"
                onClick={() => { if (window.confirm("Call this outing off and refund everyone who paid?")) void act(async () => { await api.clubEventCancel(); setOuting(await api.clubEvent()); }); }}>
                Call it off
              </button>
            </div>
          )}
          <p className="tiny muted" style={{ margin: 0 }}>Locking stops members cancelling themselves for an automatic refund. Calling it off refunds everyone.</p>
        </div>
      )}

      <strong className="small">Member requests</strong>
      {open.length === 0 && <p className="tiny muted">Nothing waiting.</p>}
      {open.map((r) => (
        <div key={r.id} className="card card-quiet stack" style={{ gap: 6 }}>
          <span className="small"><strong>{r.memberName}</strong>: {r.note}</span>
          <input aria-label={`Reply to ${r.memberName}`} value={replies[r.id] ?? ""} placeholder="What you arranged"
            onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })} />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={() => act(() => api.clubArrange(r.id, "arranged", replies[r.id] ?? ""))}>Arranged</button>
            <button className="btn btn-sm btn-ghost" onClick={() => act(() => api.clubArrange(r.id, "declined", replies[r.id] ?? ""))}>Can't</button>
          </div>
        </div>
      ))}

      <strong className="small">Invitations</strong>
      {desk.invitable.length === 0 && <p className="tiny muted">Everyone is already a member.</p>}
      {desk.invitable.map((c) => (
        <div key={c.id} className="row-between">
          <span className="small">{c.name} <span className="tiny muted">{c.email}</span></span>
          <button className="btn btn-sm" onClick={() => act(() => api.clubInvite(c.id, !c.invited))}>
            {c.invited ? "Withdraw" : "Invite"}
          </button>
        </div>
      ))}
      {error && <p className="tiny" role="alert">{error}</p>}
    </section>
  );
}
