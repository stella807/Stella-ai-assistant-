import type { MasterOverview } from "../api.ts";

export interface SummaryTile { label: string; value: string; hint?: string }
export interface AttentionItem { text: string; tone: "act" | "info" }

const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The few numbers an owner wants before scrolling: what came in, what is owed, who is on the team. */
export function summaryTiles(o: MasterOverview): SummaryTile[] {
  const tiles: SummaryTile[] = [];
  if (o.money) {
    tiles.push({ label: "Settled revenue", value: dollars(o.money.settledChargesCents), hint: plural(o.money.chargeCount, "charge") });
    tiles.push({ label: "Owed to assistants", value: dollars(o.money.unpaidPayoutsCents), hint: "unpaid" });
  }
  if (o.customers) tiles.push({ label: "Customers", value: String(o.customers.length) });
  if (o.operations) {
    tiles.push({ label: "Team", value: `${o.operations.rosterActive}/${o.operations.rosterTotal}`, hint: "active on the roster" });
  }
  return tiles;
}

/** What needs the owner today, most pressing first. Empty means a quiet day. */
export function attentionItems(o: MasterOverview): AttentionItem[] {
  const items: AttentionItem[] = [];
  const ops = o.operations;
  if (ops) {
    const waiting = ops.pendingStaffApplications + ops.pendingDriverApplications;
    if (waiting > 0) items.push({ tone: "act", text: `${plural(waiting, "job application")} waiting for you` });
    if (ops.openDeskTasks > 0) items.push({ tone: "act", text: `${plural(ops.openDeskTasks, "open desk task")}` });
    if (ops.activeConciergeTasks > 0) items.push({ tone: "info", text: `${plural(ops.activeConciergeTasks, "concierge task")} in progress` });
  }
  if (o.money) {
    if (o.money.pendingChargeCount > 0) {
      items.push({ tone: "act", text: `${plural(o.money.pendingChargeCount, "charge")} waiting on a store receipt (${dollars(o.money.pendingChargesCents)})` });
    }
    if (o.money.unpaidPayoutsCents > 0) items.push({ tone: "info", text: `${dollars(o.money.unpaidPayoutsCents)} owed to assistants` });
  }
  return items;
}
