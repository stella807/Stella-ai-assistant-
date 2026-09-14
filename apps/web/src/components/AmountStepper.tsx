import { canStepDown, canStepUp, clampAmount, presetAmounts, stepAmount, type AmountScale } from "@safehubby/core";

/** Whole dollars. Every amount this control can produce sits on a step of at
 *  least a dollar, so there are never cents to lose. */
import { dollars } from "../money.ts";

/** What the control is counting. The stepper is the same control either way —
 *  big targets, valid-by-construction values, presets plus a coarse nudge —
 *  and only the unit differs, so hours reuse it rather than getting a second
 *  near-identical widget that drifts. */
export type StepperUnit = "money" | "hours";

const HOURS_PER_UNIT = 100;
const hoursLabel = (units: number) => {
  const hours = units / HOURS_PER_UNIT;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${hours === 1 ? "hr" : "hrs"}`;
};

interface AmountStepperProps {
  id: string;
  label: string;
  /** Read under the amount. Say what the number means, not how to change it. */
  hint?: string;
  valueCents: number;
  scale: AmountScale;
  /** Candidate amounts for the big buttons; clamped to the scale, so one list
   *  can serve every mode of the same control. */
  presetsCents: readonly number[];
  /** Defaults to money. Hours are carried in the same integer units (a
   *  hundredth of an hour) so the clamping in amount-steps.ts stays integer
   *  arithmetic and none of it has to know which unit it is counting. */
  unit?: StepperUnit;
  onChange(cents: number): void;
}

/**
 * A money control for someone who has been drinking.
 *
 * This replaces a range input. A slider needs a sustained, precise drag to set
 * a number that becomes a hold on a card; this needs one tap on an amount, or
 * a coarse nudge. Nothing here is smaller than a thumb, every reachable value
 * is already valid (see amount-steps.ts), and the amount itself is set in type
 * big enough to read at arm's length in a dark bar.
 */
export function AmountStepper(
  { id, label, hint, valueCents, scale, presetsCents, unit = "money", onChange }: AmountStepperProps,
) {
  const value = clampAmount(valueCents, scale);
  const presets = presetAmounts(presetsCents, scale);
  const show = unit === "hours" ? hoursLabel : dollars;

  return (
    <div className="field amount-stepper">
      <label htmlFor={id}>{label}</label>

      <div className="amount-row">
        <button type="button" className="amount-step" aria-label={`Less — down to ${show(stepAmount(value, -1, scale))}`}
          disabled={!canStepDown(value, scale)} onClick={() => onChange(stepAmount(value, -1, scale))}>
          −
        </button>
        {/* aria-live so the amount is announced on change: the buttons move a
            number that lives somewhere else on the screen, which a screen
            reader would otherwise never mention. */}
        <output id={id} className="amount-value" aria-live="polite">{show(value)}</output>
        <button type="button" className="amount-step" aria-label={`More — up to ${show(stepAmount(value, 1, scale))}`}
          disabled={!canStepUp(value, scale)} onClick={() => onChange(stepAmount(value, 1, scale))}>
          +
        </button>
      </div>

      <div className="amount-presets">
        {presets.map((preset) => (
          <button key={preset} type="button" aria-pressed={preset === value}
            className={`amount-preset${preset === value ? " amount-preset-on" : ""}`}
            onClick={() => onChange(preset)}>
            {show(preset)}
          </button>
        ))}
      </div>

      {hint && <p className="tiny muted">{hint}</p>}
    </div>
  );
}
