import { describe, expect, it } from "vitest";
import {
  LAUNCH_STEPS, canMarkByHand, launchProgress, type LaunchFacts, type LaunchStepId,
} from "../src/launch-plan.ts";

const nothing: LaunchFacts = {
  stripeConfigured: false, serviceLive: false, rosterActive: 0, payingClients: 0,
};

describe("the launch plan", () => {
  it("starts with everything undone and Stripe as the next thing", () => {
    const p = launchProgress(nothing);
    expect(p.done).toBe(0);
    expect(p.total).toBe(LAUNCH_STEPS.length);
    // Taking money blocks everything else, so it has to be first.
    expect(p.next?.id).toBe("stripe-configured");
  });

  it("observes each step from real state rather than a tick", () => {
    const p = launchProgress({
      stripeConfigured: true, serviceLive: true, rosterActive: 2, payingClients: 3,
    });
    const done = (id: LaunchStepId) => p.steps.find((s) => s.id === id)!.done;
    expect(done("stripe-configured")).toBe(true);
    expect(done("service-live")).toBe(true);
    expect(done("on-the-roster")).toBe(true);
    expect(done("first-hire")).toBe(true);
    expect(done("first-client")).toBe(true);
    expect(done("three-clients")).toBe(true);
  });

  it("will not let an observed step be ticked true", () => {
    // The point of an observed step is that it cannot be wished into being
    // done. A dashboard that said Stripe was connected when it was not would
    // be worse than having no checklist at all.
    const p = launchProgress(nothing, {
      "stripe-configured": "2026-09-19T00:00:00.000Z",
      "first-client": "2026-09-19T00:00:00.000Z",
    });
    expect(p.steps.find((s) => s.id === "stripe-configured")!.done).toBe(false);
    expect(p.steps.find((s) => s.id === "first-client")!.done).toBe(false);
    expect(canMarkByHand("stripe-configured")).toBe(false);
    expect(canMarkByHand("first-client")).toBe(false);
  });

  it("does let the steps nothing here can see be ticked", () => {
    // A broker's quote and an application to Stripe happen outside this
    // system entirely. Labelling them is honest; pretending to observe them
    // would not be.
    for (const id of ["small-business-program", "insurance-quote", "app-store"] as LaunchStepId[]) {
      expect(canMarkByHand(id), id).toBe(true);
      const p = launchProgress(nothing, { [id]: "2026-09-19T00:00:00.000Z" });
      const step = p.steps.find((s) => s.id === id)!;
      expect(step.done, id).toBe(true);
      expect(step.markedAt, id).toBe("2026-09-19T00:00:00.000Z");
    }
  });

  it("counts one client as one client, and three as three", () => {
    const one = launchProgress({ ...nothing, payingClients: 1 });
    expect(one.steps.find((s) => s.id === "first-client")!.done).toBe(true);
    expect(one.steps.find((s) => s.id === "three-clients")!.done).toBe(false);
  });

  it("does not call one person on the roster a hire", () => {
    // That person is the owner. The first hire is the second body.
    const solo = launchProgress({ ...nothing, rosterActive: 1 });
    expect(solo.steps.find((s) => s.id === "on-the-roster")!.done).toBe(true);
    expect(solo.steps.find((s) => s.id === "first-hire")!.done).toBe(false);
  });

  it("points at the first thing not done, and at nothing once finished", () => {
    const partway = launchProgress({ ...nothing, stripeConfigured: true });
    expect(partway.next?.id).toBe("small-business-program");

    const finished = launchProgress(
      { stripeConfigured: true, serviceLive: true, rosterActive: 2, payingClients: 3 },
      {
        "small-business-program": "2026-09-19T00:00:00.000Z",
        "insurance-quote": "2026-09-19T00:00:00.000Z",
        "app-store": "2026-09-19T00:00:00.000Z",
      },
    );
    expect(finished.next).toBeNull();
    expect(finished.done).toBe(finished.total);
  });

  it("says of every step whether it is observed, and what from", () => {
    // A step claiming to be observed has to name the fact it reads, so the
    // claim can be checked rather than taken on trust.
    for (const step of LAUNCH_STEPS) {
      expect(step.label, step.id).toBeTruthy();
      expect(step.detail, step.id).toBeTruthy();
      if (step.manual) expect(step.derivedFrom, step.id).toBeUndefined();
      else expect(step.derivedFrom, step.id).toBeTruthy();
    }
  });
});
