import { LOCATION_RETENTION_DAYS, sweepLocationHistory } from "@safehubby/core";
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
    store.update((db) => {
      const result = sweepLocationHistory(db.nights, new Date());
      db.nights = result.nights;
      removed = result.removed;
    });
    if (removed > 0) console.log(`[safehubby] Retention: dropped ${removed} expired location ping(s)`);
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
