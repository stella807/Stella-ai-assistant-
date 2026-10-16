import { describe, expect, it } from "vitest";
import type { AssistantProfile, ConciergeTask, SpendRequest } from "@safehubby/core";
import { assistantFace, pendingSpendRequests, statusLine } from "../src/app/chat-cards.ts";

const photo = { base64: "AAAA", mimeType: "image/png", capturedAt: "2026-10-15T17:00:00Z" };
const request = (id: string, status: SpendRequest["status"]): SpendRequest =>
  ({ id, status, note: `item ${id}`, amountCents: 500, photo, createdAt: "2026-10-15T17:00:00Z" } as SpendRequest);
const task = (over: Partial<ConciergeTask> = {}): ConciergeTask => ({
  id: "t", travelerId: "u", category: "grab-something", note: "juice", location: { lat: 0, lng: 0 },
  spendCapCents: 500, serviceFeeCents: 0, assistantPayoutCents: 400, peopleCount: 1,
  status: "in-progress", provider: "safehubby", chargeId: "c", holdId: "h", createdAt: "2026-10-15T17:00:00Z", ...over,
});
const assistant = (over: Partial<AssistantProfile> = {}): AssistantProfile =>
  ({ id: "a", name: "Rosa Delgado", categories: [], maxConcurrentCustomers: 2, currentCustomers: 0, ...over } as AssistantProfile);

describe("which question the assistant is waiting on", () => {
  it("surfaces only the requests still open, oldest first", () => {
    // A request the customer has already answered is history, not a question,
    // and showing it again as a card would ask them twice.
    const t = task({ spendRequests: [request("1", "approved"), request("2", "open"), request("3", "open")] });
    expect(pendingSpendRequests(t).map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("has nothing to ask on a finished task, even if one was left open", () => {
    expect(pendingSpendRequests(task({ status: "completed", spendRequests: [request("1", "open")] }))).toEqual([]);
    expect(pendingSpendRequests(task({ status: "canceled", spendRequests: [request("1", "open")] }))).toEqual([]);
  });

  it("copes with a task that has no requests at all", () => {
    expect(pendingSpendRequests(task())).toEqual([]);
    expect(pendingSpendRequests(null)).toEqual([]);
  });
});

describe("whose face is on the card", () => {
  it("prefers the selfie they took for this task over their profile photo", () => {
    // The selfie is the one that answers "is this the person at my door".
    const t = task({ identityPhotos: { assistant: photo } });
    expect(assistantFace(assistant({ photoUrl: "https://x/y.png" }), t)).toBe("data:image/png;base64,AAAA");
  });

  it("falls back to the profile photo, then to nothing", () => {
    expect(assistantFace(assistant({ photoUrl: "https://x/y.png" }), task())).toBe("https://x/y.png");
    expect(assistantFace(assistant(), null)).toBeUndefined();
  });
});

describe("what the header says is going on", () => {
  it("says a running task is live", () => {
    expect(statusLine(task())).toEqual({ label: "On the job", live: true });
  });
  it("says a finished one is not", () => {
    expect(statusLine(task({ status: "completed" }))).toEqual({ label: "Completed", live: false });
    expect(statusLine(task({ status: "canceled" }))).toEqual({ label: "Canceled", live: false });
  });
  it("says nothing before there is a task", () => {
    expect(statusLine(null)).toEqual({ label: "Review your request", live: false });
  });
});
