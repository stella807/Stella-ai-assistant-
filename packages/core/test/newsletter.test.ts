import { describe, expect, it } from "vitest";
import {
  UNSUBSCRIBE_TOKEN_LENGTH, activeSubscribers, addSubscriber, isSubscribed,
  isValidNewsletterEmail, newUnsubscribeToken, subscribeToNewsletter, unsubscribe,
  type NewsletterSubscriber,
} from "../src/newsletter.ts";

const now = new Date("2026-10-05T12:00:00Z");
const later = new Date("2026-10-20T12:00:00Z");

const input = (email: string, over: Partial<Parameters<typeof subscribeToNewsletter>[0]> = {}) => ({
  id: `n-${email}`, email, token: "tok-" + email, now, ...over,
});

describe("what counts as an address", () => {
  it("accepts an ordinary one, case and spacing forgiven", () => {
    expect(isValidNewsletterEmail(" Luis@Example.COM ")).toBe(true);
    expect(subscribeToNewsletter(input(" Luis@Example.COM ")).email).toBe("luis@example.com");
  });

  it("rejects what is not an address rather than storing it and failing later", () => {
    for (const bad of ["", "   ", "nope", "a@b", "a b@c.com", "@example.com", "x@"]) {
      expect(isValidNewsletterEmail(bad)).toBe(false);
    }
    expect(() => subscribeToNewsletter(input("nope"))).toThrow(/valid email/i);
  });

  it("rejects an address longer than the RFC allows", () => {
    expect(isValidNewsletterEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

describe("unsubscribe tokens", () => {
  it("are long enough not to be guessed", () => {
    const token = newUnsubscribeToken();
    expect(token).toHaveLength(UNSUBSCRIBE_TOKEN_LENGTH);
    expect(UNSUBSCRIBE_TOKEN_LENGTH).toBeGreaterThanOrEqual(32);
  });

  it("differ between subscribers", () => {
    const seen = new Set(Array.from({ length: 100 }, () => newUnsubscribeToken()));
    expect(seen.size).toBe(100);
  });
});

describe("joining the list", () => {
  it("adds a new address", () => {
    const { list, alreadyOnList } = addSubscriber([], input("a@example.com"));
    expect(list).toHaveLength(1);
    expect(alreadyOnList).toBe(false);
    expect(list[0]!.subscribedAt).toBe(now.toISOString());
    expect(list[0]!.source).toBe("landing");
  });

  it("records where they came from, so the list says what actually worked", () => {
    const { list } = addSubscriber([], input("a@example.com", { source: "share" }));
    expect(list[0]!.source).toBe("share");
  });

  it("never lists the same address twice — a duplicate is two of every email", () => {
    const first = addSubscriber([], input("a@example.com"));
    const second = addSubscriber(first.list, input("A@EXAMPLE.COM", { id: "other" }));
    expect(second.list).toHaveLength(1);
    expect(second.alreadyOnList).toBe(true);
    // And it keeps the original record rather than replacing it.
    expect(second.list[0]!.id).toBe(first.list[0]!.id);
  });

  it("lets someone who opted out come back, keeping the id and token they hold", () => {
    const joined = addSubscriber([], input("a@example.com"));
    const gone = unsubscribe(joined.list, "a@example.com", "tok-a@example.com", later);
    expect(isSubscribed(gone.list[0]!)).toBe(false);

    const back = addSubscriber(gone.list, input("a@example.com", { id: "new-id", token: "new-tok" }));
    expect(back.list).toHaveLength(1);
    expect(back.alreadyOnList).toBe(false);
    expect(isSubscribed(back.list[0]!)).toBe(true);
    expect(back.list[0]!.id).toBe(joined.list[0]!.id);
    expect(back.list[0]!.token).toBe("tok-a@example.com");
  });
});

describe("leaving the list", () => {
  const joined = addSubscriber([], input("a@example.com")).list;

  it("takes the token as proof, not the address", () => {
    const wrong = unsubscribe(joined, "a@example.com", "not-the-token", later);
    expect(wrong.removed).toBe(false);
    expect(isSubscribed(wrong.list[0]!)).toBe(true);

    const right = unsubscribe(joined, "a@example.com", "tok-a@example.com", later);
    expect(right.removed).toBe(true);
    expect(right.list[0]!.unsubscribedAt).toBe(later.toISOString());
  });

  it("says nothing about an address that is not on the list", () => {
    // Same answer shape as a wrong token: confirming membership is itself a
    // disclosure about somebody who never asked to be looked up.
    expect(unsubscribe(joined, "stranger@example.com", "anything", later).removed).toBe(false);
  });

  it("keeps the record rather than deleting it, so a re-import cannot resurrect them", () => {
    const gone = unsubscribe(joined, "a@example.com", "tok-a@example.com", later);
    expect(gone.list).toHaveLength(1);
    expect(activeSubscribers(gone.list)).toHaveLength(0);
  });

  it("is idempotent", () => {
    const once = unsubscribe(joined, "a@example.com", "tok-a@example.com", later);
    const twice = unsubscribe(once.list, "a@example.com", "tok-a@example.com", new Date("2026-11-01T00:00:00Z"));
    expect(twice.removed).toBe(true);
    expect(twice.list[0]!.unsubscribedAt).toBe(later.toISOString());
  });
});

describe("who would actually get the launch email", () => {
  it("is the subscribed ones only", () => {
    const list: NewsletterSubscriber[] = [
      { id: "1", email: "a@x.com", source: "landing", subscribedAt: now.toISOString(), token: "t1" },
      { id: "2", email: "b@x.com", source: "landing", subscribedAt: now.toISOString(), token: "t2",
        unsubscribedAt: later.toISOString() },
    ];
    expect(activeSubscribers(list).map((s) => s.email)).toEqual(["a@x.com"]);
  });
});
