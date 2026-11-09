import type { MasterOverview } from "../api.ts";
import { attentionItems, summaryTiles } from "../app/master-summary.ts";

/** The top of the owner portal: the numbers first, then what needs doing, before the long list of controls. */
export function MasterSummary({ overview }: { overview: MasterOverview }) {
  const tiles = summaryTiles(overview);
  const items = attentionItems(overview);
  return (
    <section className="card stack master-summary glow-border" aria-label="Today at a glance">
      <h3 style={{ margin: 0 }}>Today at a glance</h3>
      {tiles.length > 0 && (
        <div className="master-tiles">
          {tiles.map((t) => (
            <div key={t.label} className="master-tile">
              <span className="tiny muted">{t.label}</span>
              <strong className="master-tile-value">{t.value}</strong>
              {t.hint && <span className="tiny muted">{t.hint}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <strong className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>Needs you</strong>
        {items.length === 0
          ? <span className="small muted">Nothing waiting. A quiet day.</span>
          : items.map((i) => (
            <span key={i.text} className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 8, flex: "none", background: i.tone === "act" ? "#f3b24c" : "#5b6b8c" }} />
              {i.text}
            </span>
          ))}
      </div>
    </section>
  );
}
