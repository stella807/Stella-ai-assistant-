import { ConciergePanel } from "./ConciergePanel.tsx";
import type { Account } from "../api.ts";

/**
 * Its own tab rather than a footnote buried under drink logging: hiring a
 * concierge is something people reasonably want to set up before a night even
 * starts, not just reach for mid-crisis. `ConciergePanel` handles everything
 * else — the plan gate, the request form, the active-task list.
 */
export function HiringScreen({ account }: { account: Account }) {
  return (
    <div className="stack">
      <div>
        <h2>Hiring</h2>
        <p className="small muted">
          Send a vetted assistant for one bounded task — grab something, sit with a friend, check on
          someone — at a spend cap you set that's never exceeded.
        </p>
      </div>
      <ConciergePanel account={account} />
    </div>
  );
}
