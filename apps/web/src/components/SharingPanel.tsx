import type { ShareGrant } from "@safehubby/core";

/**
 * The "who can see me" screen. It is always reachable and always current —
 * covert tracking is not a supported state of this product, so the list of
 * watchers and a one-tap revoke are permanent fixtures, not settings.
 */
export function SharingPanel({ grants, onShare, onRevoke, busy }: {
  grants: ShareGrant[];
  onShare: () => void;
  onRevoke: (grantId: string) => void;
  busy: boolean;
}) {
  return (
    <section className="card stack" aria-label="Who can see me">
      <div className="row-between">
        <h3>Who can see me</h3>
        <span className={grants.length ? "pill pill-safe" : "pill"}>
          {grants.length ? `${grants.length} sharing` : "Not sharing"}
        </span>
      </div>

      {grants.length === 0 ? (
        <p className="small muted">Nobody can see your location right now.</p>
      ) : (
        <ul className="timeline">
          {grants.map((g) => (
            <li key={g.id}>
              <div className="grow">
                <strong className="small">
                  {g.guardianId ? `Watched by ${g.guardianId}` : "Waiting to be claimed"}
                </strong>
                <div className="tiny muted">
                  {g.scopes.join(", ")} · until {new Date(g.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
                {!g.guardianId && (
                  <div className="tiny" style={{ userSelect: "all", letterSpacing: ".08em", fontWeight: 700 }}>
                    Code: {g.inviteCode}
                  </div>
                )}
              </div>
              <button className="btn btn-sm" disabled={busy} onClick={() => onRevoke(g.id)}>Stop</button>
            </li>
          ))}
        </ul>
      )}

      <button className="btn btn-block" disabled={busy} onClick={onShare}>Share with someone</button>

      <p className="tiny muted">
        Read the code out to one person — it works once, and only for the account that claims it.
        Sharing always expires on its own, ends when you get home, and you can stop it at any moment.
        There is no hidden mode.
      </p>
    </section>
  );
}
