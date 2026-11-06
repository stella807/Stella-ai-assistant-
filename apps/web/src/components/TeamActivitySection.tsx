import type { TeamActivity } from "@safehubby/core";
import { TEAM_EVENT_LABEL, TEAM_STATUS_LABEL, TEAM_STATUS_PILL, timeAgo } from "../app/team-activity.ts";
import { useState } from "react";
import { api } from "../api.ts";
import { money } from "../money.ts";

/**
 * Who on the team is doing what — every assistant, errand runner and driver,
 * their current jobs, recent output and unpaid pay, then a feed of what just
 * happened. Built server-side from the tasks and pickups themselves.
 */
export function TeamActivitySection({ team, canWrite = false }: { team: TeamActivity; canWrite?: boolean }) {
  const now = new Date();
  // What the owner just chose, shown at once; the saved value arrives with the next refresh.
  const [genders, setGenders] = useState<Record<string, string>>({});
  return (
    <section className="card stack">
      <h3>Team activity</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        {team.counts.onJob} on a job · {team.counts.available} available · {team.counts.offRoster} off roster
      </p>
      {team.members.length === 0 && <p className="small muted">Nobody hired yet.</p>}
      {team.members.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="pay-table">
            <thead>
              <tr><th>Name</th><th>Status</th><th>Doing now</th><th>Done 24 h / 14 d</th><th>Unpaid</th><th>Last active</th></tr>
            </thead>
            <tbody>
              {team.members.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}<div className="tiny muted">{m.roleLabel}</div>
                    {canWrite && m.role === "personal-assistant" && (
                      <select aria-label={`Gender of ${m.name}`} className="tiny" value={genders[m.id] ?? m.gender ?? ""}
                        onChange={(e) => {
                          const g = e.target.value as "female" | "male" | "";
                          setGenders((s) => ({ ...s, [m.id]: g }));
                          void api.masterSetAssistantGender(m.id, g).catch(() => setGenders((s) => ({ ...s, [m.id]: m.gender ?? "" })));
                        }}>
                        <option value="">Gender (for the wording)</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </select>
                    )}
                  </td>
                  <td><span className={TEAM_STATUS_PILL[m.status]}>{TEAM_STATUS_LABEL[m.status]}</span></td>
                  <td className="small">
                    {m.current.length === 0 ? "—" : m.current.map((j) => (
                      <div key={j.id}>
                        {j.what}{j.as === "runner" ? " (runner)" : ""}{j.place ? ` · ${j.place}` : ""}
                        <span className="tiny muted"> · {timeAgo(j.startedAt, now)}</span>
                        {j.purchaseWaiting && <span className="tiny" style={{ color: "var(--warn)" }}> · purchase waiting</span>}
                      </div>
                    ))}
                  </td>
                  <td>
                    {m.doneLastDay} / {m.doneLast14Days}
                    {(m.declined > 0 || m.disputed > 0) && (
                      <div className="tiny muted">{m.declined} declined · {m.disputed} disputed</div>
                    )}
                  </td>
                  <td>{money(m.unpaidCents)}</td>
                  <td className="tiny muted">{m.lastActiveAt ? timeAgo(m.lastActiveAt, now) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4 style={{ margin: "8px 0 0" }}>Recent activity</h4>
      {team.events.length === 0 && <p className="small muted">Nothing yet.</p>}
      <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 6 }}>
        {team.events.map((e, i) => (
          <li key={`${e.at}-${i}`} className="small">
            <strong>{e.memberName}</strong> {TEAM_EVENT_LABEL[e.kind]} {e.what.toLowerCase()}
            {e.amountCents !== undefined && ` (${money(e.amountCents)})`}
            <span className="tiny muted"> · {timeAgo(e.at, now)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
