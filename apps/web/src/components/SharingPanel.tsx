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
                <strong className="small">{g.guardianId}</strong>
                <div className="tiny muted">
                  {g.scopes.join(", ")} · until {new Date(g.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
                <div className="tiny muted" style={{ userSelect: "all" }}>Watch link id: {g.id}</div>
              </div>
              <button className="btn btn-sm" disabled={busy} onClick={() => onRevoke(g.id)}>Stop</button>
            </li>
          ))}
        </ul>
      )}

      <button className="btn btn-block" disabled={busy} onClick={onShare}>Share with someone</button>

      <p className="tiny muted">
        Sharing always expires on its own, ends when you get home, and you can stop it at any moment.
        Whoever is watching can see that they are watching — there is no hidden mode.
      </p>
    </section>
  );
}
