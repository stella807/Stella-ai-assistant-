import type { ShareGrant } from "@safehubby/core";
import { useLanguage } from "../i18n.tsx";
import { watchWords } from "../app/watch-copy.ts";
import { timeOf } from "../app/dates.ts";

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
  const { language } = useLanguage();
  const w = watchWords(language).sharing;
  return (
    <section className="card stack" aria-label={w.title}>
      <div className="row-between">
        <h3>{w.title}</h3>
        <span className={grants.length ? "pill pill-safe" : "pill"}>
          {grants.length ? w.count(grants.length) : w.none}
        </span>
      </div>

      {grants.length === 0 ? (
        <p className="small muted">{w.nobody}</p>
      ) : (
        <ul className="timeline">
          {grants.map((g) => (
            <li key={g.id}>
              <div className="grow">
                <strong className="small">
                  {g.guardianId ? w.watchedBy(g.guardianId) : w.waiting}
                </strong>
                <div className="tiny muted">
                  {g.scopes.map((s) => w.scopes[s] ?? s).join(", ")} · {w.until(timeOf(g.expiresAt, language))}
                </div>
                {!g.guardianId && (
                  <div className="tiny" style={{ userSelect: "all", letterSpacing: ".08em", fontWeight: 700 }}>
                    {w.code} {g.inviteCode}
                  </div>
                )}
              </div>
              <button className="btn btn-sm" disabled={busy} onClick={() => onRevoke(g.id)}>{w.stop}</button>
            </li>
          ))}
        </ul>
      )}

      <button className="btn btn-block" disabled={busy} onClick={onShare}>{w.share}</button>

      <p className="tiny muted">{w.note}</p>
    </section>
  );
}
