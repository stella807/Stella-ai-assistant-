import { describe, expect, it } from "vitest";
import { checkSpend } from "../src/spend-check.ts";

const rule = { max_per_request_usd: 0.25, max_per_day_usd: 2, allowed: ["live answers", "request check"], retry_if_source_down: 1, ask_first_for: ["anything new", "anything over the daily cap"] };

describe("the spending check: may this agent make this purchase under its person's rule?", () => {
  it("allows a known, allowed purchase under both caps, and says what is left for the day", () => {
    const r: any = checkSpend(rule, { item: "live answers", price_usd: 0.25, spent_today_usd: 1, seen_before: true });
    expect(r).toMatchObject({ decision: "allow", leftTodayUsd: 0.75 });
  });

  it("sends a new kind of purchase, or one over a cap, to the person, with the reason", () => {
    expect(checkSpend(rule, { item: "books", price_usd: 0.05, spent_today_usd: 0 })).toMatchObject({ decision: "ask_person", reasons: [expect.stringMatching(/not on the allowed list/i)] });
    expect((checkSpend(rule, { item: "live answers", price_usd: 0.25, spent_today_usd: 1.9, seen_before: true }) as any).decision).toBe("ask_person");
    expect((checkSpend(rule, { item: "live answers", price_usd: 0.25, spent_today_usd: 0, seen_before: false }) as any).reasons.join(" ")).toMatch(/new/i);
  });

  it("refuses over the per-request cap outright, and lets one retry through only when the source was down", () => {
    expect((checkSpend(rule, { item: "live answers", price_usd: 0.5, spent_today_usd: 0, seen_before: true }) as any).decision).toBe("deny");
    expect((checkSpend(rule, { item: "live answers", price_usd: 0.25, spent_today_usd: 0, seen_before: true, retry: { count: 1, because: "source_down" } }) as any).decision).toBe("allow");
    expect((checkSpend(rule, { item: "live answers", price_usd: 0.25, spent_today_usd: 0, seen_before: true, retry: { count: 2, because: "source_down" } }) as any).decision).toBe("ask_person");
    expect((checkSpend(rule, { item: "live answers", price_usd: 0.25, spent_today_usd: 0, seen_before: true, retry: { count: 1, because: "bad_answer" } }) as any).decision).toBe("ask_person");
  });

  it("treats a rule with no caps as no permission at all, and refuses what it cannot read", () => {
    expect((checkSpend({ allowed: ["live answers"] }, { item: "live answers", price_usd: 0.01, spent_today_usd: 0 }) as any).decision).toBe("ask_person");
    expect(checkSpend("nope", {})).toHaveProperty("error");
    expect(checkSpend(rule, { item: "live answers", price_usd: -1 })).toHaveProperty("error");
  });
});
