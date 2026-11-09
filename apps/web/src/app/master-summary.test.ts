import { describe, expect, it } from "vitest";
import { attentionItems, summaryTiles } from "./master-summary.ts";
import type { MasterOverview } from "../api.ts";

const base = { account: { id: "a", name: "O", role: "owner" }, scopes: [], generatedAt: "" } as MasterOverview;

describe("master summary", () => {
  it("is quiet when nothing is waiting", () => {
    expect(attentionItems(base)).toEqual([]);
    expect(summaryTiles(base)).toEqual([]);
  });

  it("lists applications first and pluralises", () => {
    const o = { ...base, operations: { pendingStaffApplications: 1, pendingDriverApplications: 1, openDeskTasks: 1, activeConciergeTasks: 0, rosterActive: 2, rosterTotal: 3 } } as unknown as MasterOverview;
    const items = attentionItems(o);
    expect(items[0]?.text).toBe("2 job applications waiting for you");
    expect(items[1]?.text).toBe("1 open desk task");
    expect(summaryTiles(o)[0]?.value).toBe("2/3");
  });

  it("formats money", () => {
    const o = { ...base, money: { settledChargesCents: 123456, chargeCount: 4, unpaidPayoutsCents: 500, pendingChargeCount: 0, pendingChargesCents: 0 } } as unknown as MasterOverview;
    expect(summaryTiles(o)[0]?.value).toBe("$1,234.56");
    expect(attentionItems(o)[0]?.text).toBe("$5.00 owed to assistants");
  });
});
