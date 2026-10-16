import { describe, expect, it } from "vitest";
import { costEmail } from "../src/cost-email.ts";

describe("what a request costs, by email", () => {
  it("says what is held when a request is booked", () => {
    const m = costEmail({ stage: "held", categoryLabel: "Wait with someone", serviceFeeCents: 8750, purchaseCents: 10000, assistantName: "Camila Rivera" }, "en");
    expect(m.subject).toMatch(/Wait with someone/);
    expect(m.body).toContain("$87.50");
    expect(m.body).toContain("$100.00");
    expect(m.body).toContain("$187.50");
    expect(m.body).toContain("Camila Rivera");
  });

  it("says what was actually charged once it is done", () => {
    const m = costEmail({ stage: "charged", categoryLabel: "Grab something", serviceFeeCents: 1125, purchaseCents: 640 }, "en");
    expect(m.body).toContain("$17.65");
    expect(m.body).toMatch(/charged/i);
  });

  it("writes Spanish too", () => {
    expect(costEmail({ stage: "charged", categoryLabel: "x", serviceFeeCents: 100, purchaseCents: 0 }, "es").body).toMatch(/cobr/);
  });
});
