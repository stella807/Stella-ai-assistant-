import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresStore, sslConfigFor } from "../src/store-postgres.ts";
import { keyFrom, makeCipher } from "../src/crypto.ts";
import { SEED } from "../src/seed.ts";
import type { Db } from "../src/store.ts";
import { Client } from "pg";

const URL = process.env.TEST_DATABASE_URL ?? "postgresql://sh:sh@localhost:5433/safehubby";

/**
 * These exercise the real driver against a real Postgres. They skip where none
 * is reachable so `pnpm test` still passes on a fresh clone — but they are the
 * tests that prove location data is illegible at rest, so CI must set
 * TEST_DATABASE_URL and run them.
 */
const reachable = await (async () => {
  const probe = new Client({ connectionString: URL, connectionTimeoutMillis: 1500 });
  try { await probe.connect(); await probe.end(); return true; } catch { return false; }
})();
if (!reachable) console.warn(`[skipped] No Postgres at ${URL} — set TEST_DATABASE_URL to run these.`);
const cipher = makeCipher(keyFrom("f".repeat(64))!);
const empty = (): Db => structuredClone(SEED);
const stores: PostgresStore[] = [];

const open = async (c = cipher) => {
  const s = await PostgresStore.connect(URL, c, empty());
  stores.push(s);
  return s;
};

beforeEach(async () => {
  if (!reachable) return;
  const client = new Client({ connectionString: URL });
  await client.connect();
  await client.query("DROP TABLE IF EXISTS safehubby_state");
  await client.end();
});

afterAll(async () => { for (const s of stores) await s.close().catch(() => {}); });

const traveler = (id: string) => ({
  id, email: `${id}@example.com`, passwordHash: "scrypt$00$00",
  displayName: id, planId: "free" as const, homeLabel: "Home", emergencyContacts: [],
});

describe.skipIf(!reachable)("PostgresStore", () => {
  it("creates its schema and starts empty", async () => {
    const store = await open();
    expect(store.data.travelers).toEqual([]);
  });

  it("persists across a reconnect — the point of the whole exercise", async () => {
    const first = await open();
    first.update((db) => { db.travelers.push(traveler("sam")); });
    await first.flushed();

    const second = await open();
    expect(second.data.travelers.map((t) => t.id)).toEqual(["sam"]);
  });

  it("encrypts location pings at rest", async () => {
    const store = await open();
    store.update((db) => {
      db.nights.push({
        id: "n1", travelerId: "sam", startedAt: "2026-01-01T20:00:00Z", status: "active",
        body: { weightKg: 82, widmarkRatio: 0.68 }, drinks: [], checkIns: [],
        pings: [{ lat: 40.7148, lng: -74.0018, accuracyMeters: 20, at: "2026-01-01T21:00:00Z" }],
        drinkLimit: 4,
      } as any);
    });
    await store.flushed();

    // Read the raw row: the coordinates must not be legible in the database.
    const client = new Client({ connectionString: URL });
    await client.connect();
    const { rows } = await client.query<{ document: any }>("SELECT document FROM safehubby_state WHERE id = 1");
    await client.end();

    const raw = JSON.stringify(rows[0]!.document);
    expect(raw).not.toContain("40.7148");
    expect(raw).not.toContain("-74.0018");
    expect(rows[0]!.document.nights[0].pings).toMatch(/^v1\./);

    // And they come back intact for a process holding the key.
    const reopened = await open();
    expect((reopened.data.nights[0] as any).pings[0].lat).toBeCloseTo(40.7148);
  });

  it("withholds traces from a process without the key rather than exposing them", async () => {
    const store = await open();
    store.update((db) => {
      db.nights.push({ id: "n2", travelerId: "sam", pings: [{ lat: 1, lng: 2, accuracyMeters: 5, at: "x" }] } as any);
    });
    await store.flushed();

    const keyless = await open(null);
    expect((keyless.data.nights[0] as any).pings).toEqual([]);
  });

  it("keeps writes in order", async () => {
    const store = await open();
    for (let i = 0; i < 12; i++) store.update((db) => { db.travelers.push(traveler(`t${i}`)); });
    await store.flushed();

    const reopened = await open();
    expect(reopened.data.travelers).toHaveLength(12);
    expect(reopened.data.travelers.at(-1)!.id).toBe("t11");
  });

  it("detects a second writer instead of silently clobbering it", async () => {
    const a = await open();
    const b = await open();

    a.update((db) => { db.travelers.push(traveler("from-a")); });
    await a.flushed();

    // b still holds the pre-a version, so its write must not win blindly.
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.join(" "));
    b.update((db) => { db.travelers.push(traveler("from-b")); });
    await b.flushed();
    console.error = original;

    expect(errors.join(" ")).toMatch(/exactly one replica/i);

    const reopened = await open();
    expect(reopened.data.travelers.map((t) => t.id)).toEqual(["from-a"]);
  });

  it("survives reset", async () => {
    const store = await open();
    store.update((db) => { db.travelers.push(traveler("sam")); });
    await store.flushed();
    store.reset(empty());
    await store.flushed();

    expect((await open()).data.travelers).toEqual([]);
  });
});

describe("TLS negotiation", () => {
  it("skips TLS for a local database", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(sslConfigFor(`postgresql://u:p@${host}:5432/db`)).toBeUndefined();
    }
  });

  it("skips TLS on Railway's private network, which does not offer it", () => {
    expect(sslConfigFor("postgresql://u:p@postgres.railway.internal:5432/railway")).toBeUndefined();
  });

  it("uses TLS for a public host, without demanding a chain Node lacks a root for", () => {
    expect(sslConfigFor("postgresql://u:p@monorail.proxy.rlwy.net:23456/railway"))
      .toEqual({ rejectUnauthorized: false });
  });

  it("honours an explicit sslmode", () => {
    expect(sslConfigFor("postgresql://u:p@example.com/db?sslmode=disable")).toBeUndefined();
    expect(sslConfigFor("postgresql://u:p@localhost/db?sslmode=require")).toEqual({ rejectUnauthorized: false });
    expect(sslConfigFor("postgresql://u:p@example.com/db?sslmode=verify-full")).toEqual({ rejectUnauthorized: true });
  });

  it("does not throw on a malformed URL", () => {
    expect(sslConfigFor("not a url")).toBeUndefined();
  });
});
