import { useEffect, useState } from "react";
import { api } from "../api.ts";

type Sales = Awaited<ReturnType<typeof api.agentSales>>;

/** What other AI agents paid for the vendor lookup (x402). USDC has 6 decimals: 50,000 units is 5 cents. */
export function AgentSalesSection() {
  const [s, setS] = useState<Sales | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.agentSales().then(setS).catch((e) => setError(e instanceof Error ? e.message : "Could not load")); }, []);
  if (!s) return error ? <p className="tiny" role="alert">{error}</p> : <p className="tiny muted">Loading…</p>;
  const usd = (units: number) => `$${(units / 1_000_000).toFixed(2)}`;
  return (
    <section className="card stack" aria-label="Sales to AI agents">
      <h3 style={{ margin: 0 }}>Sales to AI agents</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Other AI agents can pay per request for plan and price facts and a clean-text copy of each blog
        article, in USDC. People and search engines read the blog free. The server only has your receiving address: it can never
        send money.
      </p>
      <p className="small" style={{ margin: 0 }}><strong>{s.enabled ? "✓" : "✗"}</strong> {s.status}</p>
      <div className="vendor-counts">
        <span className="vendor-count"><strong>{s.count}</strong> paid lookup{s.count === 1 ? "" : "s"}</span>
        <span className="vendor-count"><strong>{usd(s.totalUnits)}</strong> received</span>
      </div>
      {Object.entries(s.byProduct).map(([id, v]) => (
        <p key={id} className="tiny" style={{ margin: 0 }}>{id}: {v.count} sold, {usd(v.units)}</p>
      ))}
      {s.recent.map((r) => (
        <p key={r.id} className="tiny" style={{ margin: 0 }}>
          {new Date(r.at).toLocaleString()} · {r.product ?? "vendor lookup (removed)"} · {usd(Number(r.amount))}{r.transaction ? ` · ${r.transaction.slice(0, 10)}…` : ""}
        </p>
      ))}
    </section>
  );
}
