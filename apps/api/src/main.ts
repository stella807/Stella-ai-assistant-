import { LOCATION_RETENTION_DAYS, sweepExpiredHolds, sweepLocationHistory } from "@safehubby/core";
import { renewDueSubscriptions } from "./billing.ts";
import { createApp, makeCtx } from "./server.ts";
import { cipherFromEnv } from "./crypto.ts";
import { SEED } from "./seed.ts";
import { PostgresStore } from "./store-postgres.ts";
import { Store, type StoreLike } from "./store.ts";

const port = Number(process.env.PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;
const cipher = cipherFromEnv();

/**
 * Boot checks. A deployment that quietly runs without encryption, or on a file
 * store whose disk the platform throws away on every deploy, is worse than one
 * that refuses to start — the failure would otherwise surface as silent data
 * loss weeks later.
 */
function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== "production") return;
  const problems: string[] = [];
  if (!databaseUrl) problems.push("DATABASE_URL is not set — the file store does not survive a redeploy.");
  if (!cipher) problems.push("SAFEHUBBY_ENCRYPTION_KEY is not set — location history would be stored in the clear.");
  if (problems.length) {
    console.error("[safehubby] Refusing to start in production:\n  - " + problems.join("\n  - "));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertProductionConfig();

  let store: StoreLike;
  if (databaseUrl) {
    store = await PostgresStore.connect(databaseUrl, cipher, SEED);
    console.log("[safehubby] Postgres store ready.");
  } else {
    store = new Store();
    if (store.data.travelers.length === 0 && store.data.sessions.length === 0) store.reset(SEED);
    console.log("[safehubby] File store (development only).");
  }

  console.log(`[safehubby] Location encryption: ${cipher ? "on" : "OFF"}`);
  console.log(`[safehubby] Location retention: ${LOCATION_RETENTION_DAYS} days`);

  /**
   * Retention has to actually run, on a timer, or it is a paragraph in a
   * document rather than a property of the system. Once on boot so a redeploy
   * catches up whatever accrued while the process was down, then hourly —
   * a trace is stale by the morning after, so the exact hour it goes never
   * matters.
   */
  const sweepRetention = () => {
    let removed = 0;
    let released = 0;
    let renewals = { renewed: 0, chargedCents: 0, storeRailPending: 0 };
    store.update((db) => {
      const now = new Date();
      const result = sweepLocationHistory(db.nights, now);
      db.nights = result.nights;
      removed = result.removed;

      /**
       * Release pre-authorizations that were never captured.
       *
       * payment.ts states that a hold outliving its 24-hour TTL is swept back
       * to released "rather than left open against the card indefinitely", and
       * the sweep was written — but nothing ever called it, so the promise was
       * a comment. A hold that never releases is somebody's money reserved by
       * a booking that did not happen.
       */
      const before = db.holds.filter((h) => h.status === "held").length;
      db.holds = sweepExpiredHolds(db.holds, now);
      released = before - db.holds.filter((h) => h.status === "held").length;

      // Periods have to actually turn over, or a paid plan runs forever unbilled.
      renewals = renewDueSubscriptions(db, now);
    });
    if (removed > 0) console.log(`[safehubby] Retention: dropped ${removed} expired location ping(s)`);
    if (released > 0) console.log(`[safehubby] Released ${released} expired payment hold(s)`);
    if (renewals.renewed > 0) {
      console.log(`[safehubby] Renewed ${renewals.renewed} subscription(s), $${(renewals.chargedCents / 100).toFixed(2)}`);
    }
    if (renewals.storeRailPending > 0) {
      console.log(`[safehubby] ${renewals.storeRailPending} store-billed subscription(s) awaiting a store notification — see docs/billing.md`);
    }
  };
  sweepRetention();
  const retentionTimer = setInterval(sweepRetention, 60 * 60_000);
  // Do not hold the process open on this alone.
  retentionTimer.unref?.();

  const server = createApp(makeCtx(store));
  server.listen(port, () => console.log(`[safehubby] Listening on ${port}`));

  // Railway sends SIGTERM on redeploy; finish in-flight writes before exiting
  // or the last few seconds of a night are lost.
  const shutdown = async () => {
    clearInterval(retentionTimer);
    server.close();
    if (store instanceof PostgresStore) await store.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[safehubby] Failed to start:", err);
  process.exit(1);
});
