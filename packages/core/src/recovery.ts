import type { BacEstimate } from "./bac.ts";

/**
 * The original spec for this feature asked for AI coaching to "minimize visible
 * signs of drunkenness" so a husband could appear sober to his wife. We do not
 * build that, for two reasons that are product reasons as much as ethical ones:
 *
 *  1. Nothing speeds up alcohol elimination. Coffee, cold showers, food after
 *     the fact, and exercise change how drunk someone *looks*, not how drunk
 *     they *are*. Advice that closes the gap between the two is exactly what
 *     lets an impaired person talk themselves into driving.
 *  2. An app whose whole premise is a partner trusting the log cannot also ship
 *     a mode for defeating that trust. The feature would poison the product.
 *
 * What we ship instead is genuine care: hydration, food, pacing, rest, and an
 * honest clock. It is the same feature minus the deception.
 */

export type RecoveryPhase = "during" | "next-morning";

export interface RecoveryTip {
  id: string;
  title: string;
  detail: string;
}

export interface RecoveryPlan {
  phase: RecoveryPhase;
  headline: string;
  tips: RecoveryTip[];
  /** Plain-language time math. Only time lowers BAC. */
  soberEstimate: string;
  myths: string[];
}

const MYTHS = [
  "Coffee does not sober you up. It makes a drunk person a wide-awake drunk person.",
  "Cold showers, fresh air, and exercise do not lower your blood alcohol.",
  "Eating after you drink does not undo drinks already in your system — food only slows absorption of what comes next.",
  "Feeling fine is not evidence you are fine. Alcohol impairs the judgment you would use to check.",
];

const DURING_TIPS: RecoveryTip[] = [
  {
    id: "water",
    title: "One glass of water per drink",
    detail: "Alcohol dehydrates you. Alternating water slows your pace and is the single best thing for tomorrow.",
  },
  {
    id: "food",
    title: "Eat something now",
    detail: "Food in your stomach slows how fast the *next* drinks hit. It does nothing for what you already drank.",
  },
  {
    id: "pace",
    title: "Take an hour off",
    detail: "Your body clears roughly one standard drink per hour. Anything faster and you are climbing.",
  },
  {
    id: "ride",
    title: "Book the ride before you need it",
    detail: "Deciding how you get home while you can still decide well is the whole game. Book it now.",
  },
];

const MORNING_TIPS: RecoveryTip[] = [
  {
    id: "rehydrate",
    title: "Rehydrate with electrolytes",
    detail: "Water plus salt and sugar rehydrates faster than water alone. An electrolyte packet or sports drink works.",
  },
  {
    id: "eat-carbs",
    title: "Eat plain carbs",
    detail: "Toast, rice, or bananas are easy on a sour stomach and bring blood sugar back up.",
  },
  {
    id: "sleep",
    title: "Sleep more",
    detail: "Alcohol wrecks sleep quality even when you were unconscious for eight hours. Go back to bed if you can.",
  },
  {
    id: "pain",
    title: "Skip the acetaminophen",
    detail: "Acetaminophen (Tylenol) plus a liver still processing alcohol is hard on the liver. Ibuprofen with food is the usual advice — check with a pharmacist if you take other medication.",
  },
];

export function buildRecoveryPlan(phase: RecoveryPhase, bac: BacEstimate): RecoveryPlan {
  const hours = bac.hoursUntilLikelySober;
  const soberEstimate =
    bac.estimate <= 0.001
      ? "Nothing recent is logged. If you drank tonight, assume alcohol is still in your system."
      : `At best, roughly ${formatHours(hours)} before this is likely back near zero. Only time does this — nothing on this list speeds it up.`;

  return {
    phase,
    headline:
      phase === "during"
        ? "Take care of yourself tonight"
        : "Let's get you through tomorrow",
    tips: phase === "during" ? DURING_TIPS : MORNING_TIPS,
    soberEstimate,
    myths: MYTHS,
  };
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(15, Math.round(hours * 60))} minutes`;
  const whole = Math.floor(hours);
  const mins = Math.round((hours - whole) * 60);
  return mins >= 15 ? `${whole}h ${mins}m` : `${whole} hour${whole === 1 ? "" : "s"}`;
}
