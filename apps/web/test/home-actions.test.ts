import { describe, expect, it } from "vitest";
import { activeRequests, firstName, helpTabFor, homeActions } from "../src/app/home-actions.ts";
import type { ConciergeTask } from "@safehubby/core";

const task = (over: Partial<ConciergeTask>): ConciergeTask => ({
  id: "t", travelerId: "u", category: "grab-something", note: "juice", location: { lat: 0, lng: 0 },
  spendCapCents: 500, serviceFeeCents: 0, assistantPayoutCents: 400, peopleCount: 1, status: "in-progress",
  provider: "safehubby", chargeId: "c", holdId: "h", createdAt: "2026-10-15T17:00:00Z", ...over,
});

describe("what the home screen offers", () => {
  it("leads with sending an assistant, because that is the service the launch rests on", () => {
    const ids = homeActions("premium-basic").map((a) => a.id);
    expect(ids[0]).toBe("assistant");
    expect(ids).toContain("errand");
    expect(ids).toContain("ride");
  });

  it("offers only what the plan can actually use, never a padlock", () => {
    // An account with no paid plan has no errands or assistants; a button that
    // leads to a locked screen is a promise the next tap breaks.
    const ids = homeActions("free").map((a) => a.id);
    expect(ids).not.toContain("assistant");
    expect(ids).not.toContain("errand");
    expect(ids).toContain("ride");
  });

  it("opens the Help tab that does the thing", () => {
    expect(homeActions("premium-basic").find((a) => a.id === "assistant")!.tab).toBe("concierge");
    expect(homeActions("premium-basic").find((a) => a.id === "errand")!.tab).toBe("errand");
    expect(homeActions("premium-basic").find((a) => a.id === "ride")!.tab).toBe("ride");
  });

  it("sends a running task back to the tab it was booked in", () => {
    expect(helpTabFor("grab-something")).toBe("errand");
    expect(helpTabFor("run-errand")).toBe("errand");
    expect(helpTabFor("wait-with-someone")).toBe("concierge");
    expect(helpTabFor("check-in-person")).toBe("concierge");
  });
});

describe("the requests in progress", () => {
  it("shows only those still running, newest first", () => {
    const tasks = [
      task({ id: "old", createdAt: "2026-10-14T10:00:00Z" }),
      task({ id: "done", status: "completed" }),
      task({ id: "gone", status: "canceled" }),
      task({ id: "new", createdAt: "2026-10-15T18:00:00Z" }),
    ];
    expect(activeRequests(tasks).map((t) => t.id)).toEqual(["new", "old"]);
  });
});

describe("greeting somebody", () => {
  it("uses the first word of their name, and nothing odd for a blank one", () => {
    expect(firstName("María José Rivera")).toBe("María");
    expect(firstName("  Ramón ")).toBe("Ramón");
    expect(firstName("")).toBe("");
  });
});
