import { useId } from "react";

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** A smooth area line of the last days of revenue. Plain SVG: no chart library for one picture. */
export function RevenueChart({ series }: { series: { day: string; cents: number }[] }) {
  const gradient = useId();
  const W = 320, H = 120, PAD = 6;
  const max = Math.max(1, ...series.map((d) => d.cents));
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, series.length - 1);
  const y = (c: number) => H - PAD - (c / max) * (H - PAD * 2 - 10);
  const pts = series.map((d, i) => [x(i), y(d.cents)] as const);
  // Catmull-Rom to Bezier keeps the line smooth without overshooting below zero much.
  const line = pts.map(([px, py], i) => {
    if (i === 0) return `M${px},${py}`;
    const [x0, y0] = pts[i - 1]!;
    const cx = (x0 + px) / 2;
    return `C${cx},${y0} ${cx},${py} ${px},${py}`;
  }).join(" ");
  const area = `${line} L${x(series.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`;
  const total = series.reduce((n, d) => n + d.cents, 0);
  const best = series.reduce((b, d) => (d.cents > b.cents ? d : b), series[0] ?? { day: "", cents: 0 });
  const last = pts[pts.length - 1];
  return (
    <figure className="chart" aria-label={`Revenue over the last ${series.length} days: ${usd(total)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="none" className="chart-svg">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3e2b3" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#c99a4c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H - PAD - f * (H - PAD * 2 - 10)} y2={H - PAD - f * (H - PAD * 2 - 10)}
            stroke="rgba(255,255,255,0.07)" strokeDasharray="3 4" />
        ))}
        <path d={area} fill={`url(#${gradient})`} />
        <path d={line} fill="none" stroke="#f3e2b3" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {last && total > 0 && <circle cx={last[0]} cy={last[1]} r="3.5" fill="#f3e2b3" />}
      </svg>
      <figcaption className="tiny muted">
        {total === 0
          ? "No settled revenue in the last 30 days yet."
          : `${usd(total)} in ${series.length} days · best day ${usd(best.cents)} (${best.day.slice(5)})`}
      </figcaption>
    </figure>
  );
}

/** A half-circle gauge, like a speedometer, for one percentage. */
export function Gauge({ percent, label, caption }: { percent: number; label: string; caption?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  const R = 52, C = Math.PI * R;
  return (
    <figure className="chart gauge" aria-label={`${label}: ${Math.round(p)} percent`}>
      <svg viewBox="0 0 140 84" role="img" className="gauge-svg">
        <path d="M18,76 A52,52 0 0 1 122,76" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="12" strokeLinecap="round" />
        <path d="M18,76 A52,52 0 0 1 122,76" fill="none" stroke="#e08a3c" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(p / 100) * C} ${C}`} />
        <text x="70" y="68" textAnchor="middle" className="gauge-num">{Math.round(p)}%</text>
      </svg>
      <figcaption className="tiny muted" style={{ textAlign: "center" }}>
        <strong style={{ color: "var(--ink, #e7ecf7)" }}>{label}</strong>{caption ? <><br />{caption}</> : null}
      </figcaption>
    </figure>
  );
}
