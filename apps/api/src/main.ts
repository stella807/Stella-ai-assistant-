import { LOCATION_RETENTION_DAYS, isEnabled, sweepExpiredHolds, sweepLocationHistory } from "@safehubby/core";
import {
  SUBSCRIPTION_CHARGE_ATTEMPTS, collectSubscriptionCharges, renewDueSubscriptions, retryPastDueSubscriptions,
} from "./billing.ts";
import { chargeSaved, chargingReady } from "./adapters/charging.ts";
import { createApp, makeCtx } from "./server.ts";
import { createCryptoRoutes } from "./adapters/openreceive.ts";
import { emailMode } from "./adapters/email.ts";
import { ensureStripeCardholder } from "./adapters/stripe-cards.ts";
import { describeStripeAccount } from "./adapters/stripe.ts";
import { runFlightSweep, runPayroll } from "./routes.ts";
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
    // One line, because a platform log shows each line as its own entry and the reason must sit with the headline.
    console.error("[safehubby] Refusing to start in production: " + problems.join(" | "));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertProductionConfig();
  // Said at boot, so "Admin access is not configured" can be checked in the
  // deploy log without guessing whether the variable reached this service.
  // Only whether it is set and how long it is — never the key itself.
  // Which commit is running, so "is the fix deployed?" is answered by the log.
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7);
  console.log(`[safehubby] Version: ${commit ?? "unknown"}${process.env.RAILWAY_GIT_COMMIT_MESSAGE ? ` — ${process.env.RAILWAY_GIT_COMMIT_MESSAGE.split("\n")[0]}` : ""}.`);
  const adminKey = process.env.SAFEHUBBY_ADMIN_KEY?.trim();
  console.log(adminKey
    ? `[safehubby] Admin key: set (${adminKey.length} characters).`
    : "[safehubby] Admin key: NOT SET — add SAFEHUBBY_ADMIN_KEY to this service's variables.");
  // Which payment keys this service can see — names and modes only, never the
  // values. Stripe needs both keys; with either missing, cards fall back to
  // PayPal, which otherwise looks like Stripe silently not working.
  // A restricted secret key (rk_) works the same as a full one (sk_).
  const mode = (v: string | undefined, live: string, test: string) =>
    !v?.trim() ? "MISSING"
      : [live, live.replace("sk_", "rk_")].some((p) => v.trim().startsWith(p)) ? "live"
      : [test, test.replace("sk_", "rk_")].some((p) => v.trim().startsWith(p)) ? "test"
      : "set, but not a recognised key";
  console.log(`[safehubby] Stripe: STRIPE_SECRET_KEY ${mode(process.env.STRIPE_SECRET_KEY, "sk_live_", "sk_test_")}, `
    + `STRIPE_PUBLISHABLE_KEY ${mode(process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.VITE_STRIPE_PUBLISHABLE_KEY, "pk_live_", "pk_test_")}, `
    + `STRIPE_WEBHOOK_SECRET ${process.env.STRIPE_WEBHOOK_SECRET?.trim() ? "set" : "MISSING"}.`);
  // Payment-method settings are per account and per mode; this says which
  // one to edit in the Dashboard.
  void describeStripeAccount().then((d) => console.log(`[safehubby] Stripe account: ${d}.`))
    .catch((e) => console.log(`[safehubby] Stripe account: could not be read (${(e as Error).message}).`));
  // Task cards through Stripe: find or create the company cardholder, so it
  // needs no setup by hand. Retried hourly until Issuing is approved.
  const setUpCards = async () => {
    const result = await ensureStripeCardholder();
    if ("id" in result) {
      console.log(`[safehubby] Stripe Issuing: ready, cardholder ${result.id}${result.created ? " (just created)" : ""}.`);
      return true;
    }
    console.log(`[safehubby] Stripe Issuing: not ready (${result.error}). Task cards use Lithic until then.`);
    return false;
  };
  if (process.env.STRIPE_SECRET_KEY?.trim()) {
    void setUpCards().then((ok) => {
      if (ok) return;
      const timer = setInterval(() => { void setUpCards().then((done) => { if (done) clearInterval(timer); }); }, 60 * 60_000);
      timer.unref();
    });
  }
  console.log(`[safehubby] Email (alerts): ${emailMode() ?? "NOT ready (set BREVO_API_KEY)"}.`);
  console.log(`[safehubby] ATH Móvil: ${process.env.ATH_MOVIL_PUBLIC_TOKEN?.trim() ? "connected" : "not connected (ATH_MOVIL_PUBLIC_TOKEN missing)"}${process.env.ATH_MOVIL_PRIVATE_TOKEN?.trim() ? "" : ", refunds need ATH_MOVIL_PRIVATE_TOKEN"}.`);
  console.log(`[safehubby] PayPal: ${!isEnabled("paypal-payments") ? "paused (paypal-payments is off)"
    : process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim() ? "connected" : "not connected"}.`);

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
  if (cipher?.rotating) {
    // Loading opened everything under either key; one save writes it all back
    // under the new one, so the old key is not needed after this boot.
    store.update(() => {});
    console.log(`[safehubby] Encryption key rotated: writing everything back under the new key. `
      + `Remove SAFEHUBBY_ENCRYPTION_KEY_PREVIOUS once this deploy is healthy.`);
  }
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
    let renewals = { renewed: 0, chargedCents: 0, storeRailPending: 0, toCollect: [] as string[] };
    const now = new Date();
    store.update((db) => {
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
      renewals = renewDueSubscriptions(db, now, { collect: chargingReady() });
    });
    if (removed > 0) console.log(`[safehubby] Retention: dropped ${removed} expired location ping(s)`);
    if (released > 0) console.log(`[safehubby] Released ${released} expired payment hold(s)`);
    if (renewals.renewed > 0) {
      console.log(`[safehubby] Renewed ${renewals.renewed} subscription(s), $${(renewals.chargedCents / 100).toFixed(2)}`);
    }
    // Taking the cards happens after the sweep has saved: a network call has
    // no place inside a store update.
    if (chargingReady()) {
      (async () => {
        const taken = await collectSubscriptionCharges(store, now, renewals.toCollect, chargeSaved);
        const retried = await retryPastDueSubscriptions(store, now, chargeSaved);
        const declined = taken.failed + retried.failed;
        if (declined > 0) console.log(`[safehubby] ${declined} plan charge(s) declined — those plans are past due`);
        if (retried.ended > 0) console.log(`[safehubby] ${retried.ended} plan(s) ended after ${SUBSCRIPTION_CHARGE_ATTEMPTS} declined tries`);
      })().catch((err) => console.error("[safehubby] Plan charging failed:", err));
    }
    if (renewals.storeRailPending > 0) {
      console.log(`[safehubby] ${renewals.storeRailPending} store-billed subscription(s) awaiting a store notification — see docs/billing.md`);
    }
  };
  sweepRetention();
  const retentionTimer = setInterval(sweepRetention, 60 * 60_000);
  // Do not hold the process open on this alone.
  retentionTimer.unref?.();

  /**
   * Assistants are paid biweekly, but this runs hourly like every other
   * sweep here — `runPayroll` only ever pays a task once (it tags the task
   * the moment it's paid), so an hourly check just means a payout goes out
   * within the hour after its period actually closes, and a failed attempt
   * gets retried on the very next run instead of waiting two more weeks.
   */
  const sweepPayroll = () => {
    runPayroll(makeCtx(store)).then(({ paid, failed, totalCents }) => {
      if (paid > 0) console.log(`[safehubby] Payroll: paid ${paid} assistant(s), $${(totalCents / 100).toFixed(2)}`);
      if (failed > 0) console.log(`[safehubby] Payroll: ${failed} payout(s) could not be sent — see the payouts ledger`);
    }).catch((err) => console.error("[safehubby] Payroll sweep failed:", err));
  };
  sweepPayroll();
  const payrollTimer = setInterval(sweepPayroll, 60 * 60_000);
  payrollTimer.unref?.();

  /**
   * Flights, unlike payroll and retention, do not keep for an hour.
   *
   * The update that matters is "the plane is on the ground" and it is worth
   * nothing fifty minutes after the fact — someone is already standing in the
   * wrong terminal. Five minutes is roughly the latency of the underlying
   * ADS-B/provider data anyway, so asking faster would mostly re-read the
   * same fix.
   *
   * This costs nothing when it has nothing to do: with no flight provider
   * configured `runFlightSweep` returns immediately, and even configured it
   * only calls out for airport pickups still in progress whose flight has
   * not already resolved.
   */
  const sweepFlights = () => {
    runFlightSweep(makeCtx(store)).then(({ checked, changed, pushed }) => {
      if (changed > 0) {
        console.log(`[safehubby] Flights: ${changed} of ${checked} flight(s) changed, ${pushed} push(es) sent`);
      }
    }).catch((err) => console.error("[safehubby] Flight sweep failed:", err));
  };
  sweepFlights();
  const flightTimer = setInterval(sweepFlights, 5 * 60_000);
  flightTimer.unref?.();

  // A bad wallet code must not keep the rest of the app from starting.
  const cryptoRoutes = await createCryptoRoutes(store).catch((err) => {
    console.error("[safehubby] Crypto payments are off:", err instanceof Error ? err.message : err);
    return null;
  });
  if (cryptoRoutes) console.log("[safehubby] Crypto payments: set up (OpenReceive) — the wallet is checked on the first payment");
  const server = createApp(makeCtx(store), cryptoRoutes);
  server.listen(port, () => console.log(`[safehubby] Listening on ${port}`));

  // Railway sends SIGTERM on redeploy; finish in-flight writes before exiting
  // or the last few seconds of a night are lost.
  const shutdown = async () => {
    clearInterval(retentionTimer);
    clearInterval(payrollTimer);
    clearInterval(flightTimer);
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
