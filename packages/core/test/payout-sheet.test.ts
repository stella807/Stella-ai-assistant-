import { describe, expect, it } from "vitest";
import { payoutSheet, payoutSheetCsv, previousPayoutPeriod, type ConciergeTask } from "../src/index.ts";

const period = previousPayoutPeriod(new Date("2026-12-20T12:00:00Z"));
const inPeriod = new Date(period.start.getTime() + 3 * 86_400_000).toISOString();

const task = (over: Partial<ConciergeTask>): ConciergeTask => ({
  id: "t1", travelerId: "tr1", category: "grab-something", note: "A juice for Mami", status: "completed",
  assistantId: "a1", assistantPayoutCents: 1050, completedAt: inPeriod, ...over,
} as ConciergeTask);

const base = {
  period, adjustments: [], payouts: [],
  workers: { a1: { name: "Andrea", market: "puerto-rico", exempt: false } },
  destinations: { a1: { accountHolderName: "Andrea Colón", accountNumberLast4: "4321" } },
  clientName: () => "Natalie",
};

describe("the payout sheet", () => {
  it("shows who did what for whom, and what to send after Hacienda's 10%", () => {
    const sheet = payoutSheet({ ...base, tasks: [task({}), task({ id: "t2", assistantPayoutCents: 3500, category: "check-in-person" })] });
    const [line] = sheet.lines;
    expect(line!.tasks.map((t) => [t.taskId, t.clientName, t.payoutCents])).toEqual([["t1", "Natalie", 1050], ["t2", "Natalie", 3500]]);
    expect(line).toMatchObject({ earnedCents: 4550, withheldCents: 455, netCents: 4095, clawbackCents: 0 });
    expect(sheet.totals.netCents).toBe(4095);
  });

  it("takes an upheld dispute off before withholding", () => {
    const sheet = payoutSheet({
      ...base, tasks: [task({})],
      adjustments: [{ id: "adj1", assistantId: "a1", taskId: "x", reason: "r", totalCents: 500, remainingCents: 500, createdAt: "2026-11-01T00:00:00Z" }],
    });
    expect(sheet.lines[0]).toMatchObject({ earnedCents: 1050, clawbackCents: 500, withheldCents: 55, netCents: 495 });
  });

  it("leaves out tasks already paid, or finished outside the period", () => {
    const sheet = payoutSheet({
      ...base, tasks: [task({ payoutId: "p1" }), task({ id: "t3", completedAt: new Date(period.end.getTime() + 1000).toISOString() })],
    });
    expect(sheet.lines).toEqual([]);
  });

  it("says why a line cannot be sent, and exposes only the last four digits", () => {
    const none = payoutSheet({ ...base, tasks: [task({})], destinations: {} });
    expect(none.lines[0]!.blocker).toMatch(/No bank account/);
    const ok = payoutSheet({ ...base, tasks: [task({})] });
    expect(ok.lines[0]!.destination).toEqual({ holderName: "Andrea Colón", last4: "4321" });
  });

  it("writes a CSV whose text cannot run as a spreadsheet formula", () => {
    const sheet = payoutSheet({ ...base, tasks: [task({ note: "=HYPERLINK(\"x\"),\nbuy milk" })] });
    const csv = payoutSheetCsv(sheet);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.split("\r\n")[0]).toContain("Send (USD)");
    expect(csv).toContain("9.45");
  });
});
