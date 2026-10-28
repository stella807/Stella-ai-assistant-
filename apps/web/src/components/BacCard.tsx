import type { BacEstimate } from "@safehubby/core";
import { useLanguage } from "../i18n.tsx";
import { nightWords } from "../app/night-copy.ts";

const BAND_PILL: Record<BacEstimate["band"], string> = {
  none: "pill", low: "pill pill-warn", moderate: "pill pill-warn",
  high: "pill pill-danger", severe: "pill pill-danger",
};

/**
 * Renders the range, not just the number. The point estimate is drawn as a
 * single tick inside a wide band so the UI reads as "somewhere in here",
 * which is the only honest way to present a Widmark estimate from a typed log.
 */
export function BacCard({ bac }: { bac: BacEstimate }) {
  const w = nightWords(useLanguage().language).bac;
  const scaleMax = Math.max(0.12, bac.high * 1.15);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  return (
    <section className="card card-hero stack" aria-label={w.label}>
      <div className="row-between">
        <h3>{w.title}</h3>
        <span className={BAND_PILL[bac.band]}>{w.band[bac.band]}</span>
      </div>

      <div>
        <div className="num" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.05 }}>
          {bac.low.toFixed(3)}–{bac.high.toFixed(3)}
          <span className="muted" style={{ fontSize: 15, fontWeight: 550, letterSpacing: "-0.01em" }}> %BAC</span>
        </div>
        <p className="tiny muted" style={{ marginTop: 4 }}>{w.rough}</p>
      </div>

      <div className="meter" role="img" aria-label={w.meter(bac.low, bac.high)}>
        <div className="meter-range" style={{ left: pct(bac.low), width: pct(bac.high - bac.low) }} />
        <div className="meter-point" style={{ left: pct(bac.estimate) }} />
      </div>

      <p className="small">{bac.guidance}</p>

      {bac.estimate > 0 && (
        <p className="tiny muted">{w.sober(bac.hoursUntilLikelySober.toFixed(1))}</p>
      )}

      <div className="banner banner-danger">
        <strong>{w.never}</strong> {w.neverBody}
      </div>
    </section>
  );
}
