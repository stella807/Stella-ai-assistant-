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
        Other AI agents can pay per lookup of our vendor research, in USDC. The server only has your receiving address: it can
        never send money.
      </p>
      <p className="small" style={{ margin: 0 }}><strong>{s.enabled ? "✓" : "✗"}</strong> {s.status}</p>
      <div className="vendor-counts">
        <span className="vendor-count"><strong>{s.count}</strong> paid lookup{s.count === 1 ? "" : "s"}</span>
        <span className="vendor-count"><strong>{usd(s.totalUnits)}</strong> received</span>
      </div>
      {s.recent.map((r) => (
        <p key={r.id} className="tiny" style={{ margin: 0 }}>
          {new Date(r.at).toLocaleString()} · {usd(Number(r.amount))} · {r.results} results{r.transaction ? ` · ${r.transaction.slice(0, 10)}…` : ""}
        </p>
      ))}
    </section>
  );
}
