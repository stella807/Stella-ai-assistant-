import type { BacEstimate } from "@safehubby/core";

const BAND_LABEL: Record<BacEstimate["band"], string> = {
  none: "Nothing logged",
  low: "Alcohol in system",
  moderate: "Impaired",
  high: "Significantly impaired",
  severe: "Danger zone",
};

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
  const scaleMax = Math.max(0.12, bac.high * 1.15);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  return (
    <section className="card card-hero stack" aria-label="Estimated intoxication">
      <div className="row-between">
        <h3>Estimated level</h3>
        <span className={BAND_PILL[bac.band]}>{BAND_LABEL[bac.band]}</span>
      </div>

      <div>
        <div className="num" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.05 }}>
          {bac.low.toFixed(3)}–{bac.high.toFixed(3)}
          <span className="muted" style={{ fontSize: 15, fontWeight: 550, letterSpacing: "-0.01em" }}> %BAC</span>
        </div>
        <p className="tiny muted" style={{ marginTop: 4 }}>
          Rough estimate from what was logged — not a measurement.
        </p>
      </div>

      <div className="meter" role="img" aria-label={`Estimated between ${bac.low} and ${bac.high} percent BAC`}>
        <div className="meter-range" style={{ left: pct(bac.low), width: pct(bac.high - bac.low) }} />
        <div className="meter-point" style={{ left: pct(bac.estimate) }} />
      </div>

      <p className="small">{bac.guidance}</p>

      {bac.estimate > 0 && (
        <p className="tiny muted">
          Likely back near zero in about {bac.hoursUntilLikelySober.toFixed(1)}h. Only time does this.
        </p>
      )}

      <div className="banner banner-danger">
        <strong>Never drive on this number.</strong> Safehubby cannot tell you that you are fit to drive,
        at any reading. If you have had anything at all, get a ride.
      </div>
    </section>
  );
}
