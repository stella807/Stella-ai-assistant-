import type { Iso8601 } from "./types.ts";

/**
 * The route from a deployed app to a business that pays for itself, as steps
 * the dashboard can check rather than a list somebody has to remember.
 *
 * Most of these are **observed, not ticked**. Whether Stripe is configured,
 * whether anybody is on the roster, how many people are actually paying —
 * the app already knows all of that, and a checklist that made the owner
 * assert it by hand would drift from the truth the first time something was
 * ticked hopefully. `derivedFrom` names the fact each step reads.
 *
 * The rest are things happening outside this system — a broker's quote, an
 * application to Stripe — which nothing here can see. Those carry
 * `manual: true` and are stored as a date when the owner says so. The
 * distinction is the point: a step that claims to be observed had better be,
 * and one that cannot be is labelled rather than quietly faked.
 *
 * Ordered by what blocks what, not by importance. Taking money blocks
 * everything, so it is first; the App Store blocks nothing, so it is last.
 */

export type LaunchStepId =
  | "stripe-configured"
  | "small-business-program"
  | "insurance-quote"
  | "on-the-roster"
  | "service-live"
  | "first-client"
  | "three-clients"
  | "first-hire"
  | "app-store";

export interface LaunchStep {
  id: LaunchStepId;
  label: string;
  /** Why this one, and what it unblocks. */
  detail: string;
  /** True where nothing in this system can observe it — see the module doc. */
  manual: boolean;
  /** What the app reads to decide. Absent on manual steps. */
  derivedFrom?: string;
}

export const LAUNCH_STEPS: LaunchStep[] = [
  {
    id: "stripe-configured",
    label: "Connect Stripe",
    detail: "Until a secret key is set, no plan can be charged and no hold can be placed. Nothing else earns anything without this.",
    manual: false,
    derivedFrom: "the Stripe adapter reporting automatic rather than handoff",
  },
  {
    id: "small-business-program",
    label: "Apply to Stripe's Small Business Program",
    detail: "15% rather than 30% on anything sold through an app store, under $1M a year. It is not applied retroactively, so the cost of waiting is permanent.",
    manual: true,
  },
  {
    id: "insurance-quote",
    label: "Get a real insurance quote",
    detail: "$75 a person a month is a placeholder in the staffing model, not a quote. Someone is going alone into a stranger's home on your behalf before this matters.",
    manual: true,
  },
  {
    id: "on-the-roster",
    label: "Put yourself on the roster",
    detail: "Requests can only be dispatched to somebody hired here. With an empty roster and no partner network, every task is refused.",
    manual: false,
    derivedFrom: "anybody active on the roster",
  },
  {
    id: "service-live",
    label: "Reach the service-live date",
    detail: "Before it, signups work and dispatch is refused — deliberately, so nobody is charged for something that cannot happen yet.",
    manual: false,
    derivedFrom: "SERVICE_LIVE_AT against today",
  },
  {
    id: "first-client",
    label: "One paying client",
    detail: "One Family plan covers the whole operation with room to spare. One Premium covers it on the web, where no store takes a cut.",
    manual: false,
    derivedFrom: "active subscriptions on a paid plan",
  },
  {
    id: "three-clients",
    label: "Three paying clients, served by you",
    detail: "The most profitable clients you will ever have: you keep the whole task fee rather than a fifth of it, and you learn what the product actually is.",
    manual: false,
    derivedFrom: "active subscriptions on a paid plan",
  },
  {
    id: "first-hire",
    label: "First assistant hired",
    detail: "Hire when you are regularly near capacity, not when the maths allows it — insurance starts the day they join and the lead time is days.",
    manual: false,
    derivedFrom: "a second person active on the roster",
  },
  {
    id: "app-store",
    label: "Ship to the App Store",
    detail: "Last on purpose. It blocks nothing — the web app already works on a phone — and it needs Apple in-app purchase wired first.",
    manual: true,
  },
];

/** What the app can see about itself, gathered by the caller. */
export interface LaunchFacts {
  stripeConfigured: boolean;
  serviceLive: boolean;
  rosterActive: number;
  payingClients: number;
}

export interface LaunchStepStatus extends LaunchStep {
  done: boolean;
  /** When a manual step was ticked. Absent on observed steps, which have no
   *  moment of completion to record — they are simply true or not. */
  markedAt?: Iso8601;
}

export interface LaunchProgress {
  steps: LaunchStepStatus[];
  done: number;
  total: number;
  /** The first step not yet done — what to actually work on. Null once the
   *  whole list is complete. */
  next: LaunchStepStatus | null;
}

/**
 * Where the business is, from what the app can see plus whatever has been
 * ticked by hand.
 *
 * An observed step ignores its manual tick entirely, rather than letting one
 * override the other. Ticking "Connect Stripe" when Stripe is not connected
 * should not make a dashboard say it is — the whole value of an observed
 * step is that it cannot be wished true.
 */
export function launchProgress(
  facts: LaunchFacts,
  markedAt: Partial<Record<LaunchStepId, Iso8601>> = {},
): LaunchProgress {
  const observed: Record<LaunchStepId, boolean> = {
    "stripe-configured": facts.stripeConfigured,
    "small-business-program": false,
    "insurance-quote": false,
    "on-the-roster": facts.rosterActive >= 1,
    "service-live": facts.serviceLive,
    "first-client": facts.payingClients >= 1,
    "three-clients": facts.payingClients >= 3,
    "first-hire": facts.rosterActive >= 2,
    "app-store": false,
  };

  const steps = LAUNCH_STEPS.map((step): LaunchStepStatus => ({
    ...step,
    done: step.manual ? Boolean(markedAt[step.id]) : observed[step.id],
    ...(step.manual && markedAt[step.id] ? { markedAt: markedAt[step.id] } : {}),
  }));

  return {
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    next: steps.find((s) => !s.done) ?? null,
  };
}

/** Refuses a tick on a step the app observes for itself — see
 *  `launchProgress`'s doc comment for why that must not be possible. */
export function canMarkByHand(id: LaunchStepId): boolean {
  return Boolean(LAUNCH_STEPS.find((s) => s.id === id)?.manual);
}
