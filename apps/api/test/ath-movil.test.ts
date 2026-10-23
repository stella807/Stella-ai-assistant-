import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balanceSummary } from "@safehubby/core";
import { normalizeAthPhone } from "../src/adapters/ath-movil.ts";
import { cancelAthLoad, checkAthLoad, creditAthLoad, startAthLoad } from "../src/ath-loads.ts";
import { SEED } from "../src/seed.ts";
import type { Db, StoreLike } from "../src/store.ts";

const now = new Date("2027-01-01T00:00:00Z");
function memoryStore(): StoreLike {
  const db: Db = structuredClone(SEED);
  return { data: db, update: (fn) => fn(db), reset: () => {}, save: () => {} };
}

type Call = { path: string; body: any; auth?: string };
const calls: Call[] = [];
/** ATH's API, answering by path. `status` is what findPayment reports. */
function stubAth(state: { status: string; total?: string }) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/ecommerce/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body, auth: (init?.headers as Record<string, string> | undefined)?.authorization });
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ status: "success", data }) }) as Response;
    if (path === "/payment") return ok({ ecommerceId: "ec_1", auth_token: "tok_1" });
    if (path === "/business/findPayment") return ok({ ecommerceStatus: state.status, total: state.total ?? "25.00", ...(state.status === "COMPLETED" ? { referenceNumber: "ref_9" } : {}) });
    if (path === "/authorization") { state.status = "COMPLETED"; return ok({ ecommerceStatus: "COMPLETED", referenceNumber: "ref_9", total: state.total ?? "25.00" }); }
    if (path === "/business/cancel") return ok("Payment Cancelled.");
    return { ok: false, status: 404, json: async () => ({ status: "error", message: "nope" }) } as Response;
  }));
}

beforeEach(() => { process.env.ATH_MOVIL_PUBLIC_TOKEN = "pub"; process.env.ATH_MOVIL_PRIVATE_TOKEN = "priv"; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.ATH_MOVIL_PUBLIC_TOKEN; delete process.env.ATH_MOVIL_PRIVATE_TOKEN; });

describe("ATH Móvil balance loads", () => {
  it("opens a payment for the server's amount and the member's phone", async () => {
    stubAth({ status: "OPEN" });
    const store = memoryStore();
    const load = await startAthLoad(store, { travelerId: "t1", amountCents: 2500, phone: "7875551234", now });
    expect(calls[0]!.body).toMatchObject({ publicToken: "pub", total: "25.00", phoneNumber: "7875551234", metadata2: load.id });
    expect(load).toMatchObject({ status: "open", ecommerceId: "ec_1" });
  });

  it("waits while the member has not approved, then authorizes and credits once", async () => {
    const state = { status: "OPEN" };
    stubAth(state);
    const store = memoryStore();
    const load = await startAthLoad(store, { travelerId: "t1", amountCents: 2500, phone: "7875551234", now });
    expect(await checkAthLoad(store, load.id, now)).toBe("open");
    expect(calls.some((c) => c.path === "/authorization")).toBe(false);

    state.status = "CONFIRM";
    expect(await checkAthLoad(store, load.id, now)).toBe("paid");
    expect(calls.find((c) => c.path === "/authorization")!.auth).toBe("Bearer tok_1");
    expect(await checkAthLoad(store, load.id, now)).toBe("paid");
    expect(calls.filter((c) => c.path === "/authorization")).toHaveLength(1);
    expect(balanceSummary(store.data.balanceEntries, store.data.holds, "t1").availableCents).toBe(2500);
    expect(store.data.athLoads![0]).toMatchObject({ status: "paid", referenceNumber: "ref_9" });
  });

  it("never credits an amount ATH did not take", async () => {
    stubAth({ status: "CONFIRM", total: "1.00" });
    const store = memoryStore();
    const load = await startAthLoad(store, { travelerId: "t1", amountCents: 2500, phone: "7875551234", now });
    await expect(checkAthLoad(store, load.id, now)).rejects.toThrow(/different amount/);
    expect(store.data.balanceEntries).toHaveLength(0);
  });

  it("marks a declined payment cancelled, and expires one left unapproved", async () => {
    const state = { status: "CANCEL" };
    stubAth(state);
    const store = memoryStore();
    const a = await startAthLoad(store, { travelerId: "t1", amountCents: 2500, phone: "7875551234", now });
    expect(await checkAthLoad(store, a.id, now)).toBe("canceled");

    state.status = "OPEN";
    const b = await startAthLoad(store, { travelerId: "t1", amountCents: 2500, phone: "7875551234", now });
    expect(await checkAthLoad(store, b.id, new Date(now.getTime() + 11 * 60_000))).toBe("expired");
    expect(calls.some((c) => c.path === "/business/cancel")).toBe(true);
    expect(store.data.balanceEntries).toHaveLength(0);
  });

  it("lets the member cancel an open payment, and credits idempotently", async () => {
    stubAth({ status: "OPEN" });
    const store = memoryStore();
    const load = await startAthLoad(store, { travelerId: "t1", amountCents: 2500, phone: "7875551234", now });
    await cancelAthLoad(store, load.id);
    expect(store.data.athLoads![0]!.status).toBe("canceled");
    expect(creditAthLoad(store, load.id, "r", now)).toBe(true);
    expect(creditAthLoad(store, load.id, "r", now)).toBe(false);
  });

  it("reads a phone number however it is typed", () => {
    expect(normalizeAthPhone("(787) 555-1234")).toBe("7875551234");
    expect(normalizeAthPhone("+1 939 555 1234")).toBe("9395551234");
    expect(() => normalizeAthPhone("555-1234")).toThrow(/10-digit/);
  });
});
