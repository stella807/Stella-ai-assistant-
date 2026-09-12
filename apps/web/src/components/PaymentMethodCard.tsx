import { useEffect, useState } from "react";
import { api, type PaymentMethod, type PaymentProcessor, type ProcessorStatus, type WalletType } from "../api.ts";

type Tab = "card" | "apple-pay" | "google-pay" | "paypal";

const TAB_LABEL: Record<Tab, string> = {
  card: "Card",
  "apple-pay": "Apple Pay",
  "google-pay": "Google Pay",
  paypal: "PayPal",
};

/** Which real processor settles each tab. Apple Pay and Google Pay are not
 *  separate processors — both are wallets Stripe's own SDK surfaces on top
 *  of the same card rails, so they map onto the `stripe` status the same
 *  way the plain "Card" tab does. See stripe.ts's doc comment. */
const PROCESSOR_FOR: Record<Tab, PaymentProcessor> = {
  card: "stripe",
  "apple-pay": "stripe",
  "google-pay": "stripe",
  paypal: "paypal",
};

/**
 * The one payment method on the account. It backs every charge that is not a
 * store-billed subscription: rides, secure transport, pharmacy runs, and the
 * subscription itself on the web. Adding one does not charge anything by
 * itself — it lets a hold be placed at the moment a trip is actually booked,
 * and Safehubby never spends before that hold exists.
 *
 * Four tabs, two real backends: Stripe and PayPal are independent processors
 * with their own credentials (see apps/api/src/adapters/stripe.ts and
 * paypal.ts). Apple Pay and Google Pay are wallets Stripe's own client SDK
 * (the Payment Request Button / Payment Element) offers automatically when a
 * browser or device supports them — never claimed here without Stripe itself
 * being configured, and never claimed for Apple Pay without the one real,
 * standard signal a browser gives for it (`ApplePaySession.canMakePayments`).
 * Whichever tab is active, once the real SDK tokenizes a method client-side,
 * only the resulting token is sent here — this app never sees a raw card or
 * PayPal login. Without real credentials configured on the server, every tab
 * but Card reports honestly as not yet connected rather than pretending to
 * work; Card falls back to the same typed-in mock form this screen has
 * always had (see docs/billing.md).
 */
export function PaymentMethodCard() {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [processors, setProcessors] = useState<ProcessorStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<Tab>("card");
  const [canApplePay, setCanApplePay] = useState(false);
  const [brand, setBrand] = useState("Visa");
  const [last4, setLast4] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.paymentMethod(), api.paymentProcessors()])
      .then(([m, p]) => {
        setMethod(m.method);
        setProcessors(p.processors);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

    // The one honest, standards-based signal a browser gives for Apple Pay
    // support — no fabricated fallback for browsers that don't expose it.
    try {
      setCanApplePay(Boolean((window as any).ApplePaySession?.canMakePayments?.()));
    } catch {
      setCanApplePay(false);
    }
  }, []);

  const statusOf = (processor: PaymentProcessor) => processors.find((p) => p.id === processor) ?? null;
  const activeStatus = statusOf(PROCESSOR_FOR[tab]);
  const processorReady = activeStatus?.mode === "automatic";

  const attachCard = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.attachPaymentMethod({
        processor: "stripe", brand, last4: last4.trim(), expMonth: Number(expMonth), expYear: Number(expYear),
      });
      setMethod(res.method);
      setAdding(false);
      setLast4("");
      setExpMonth("");
      setExpYear("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that card");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Where a real deployment hands off to the processor's own client SDK:
   * Stripe's Payment Request Button (for Apple Pay/Google Pay) or Elements
   * (for a typed card), and PayPal's JS SDK button for the PayPal tab. Each
   * would tokenize the method in the browser and call
   * `api.attachPaymentMethod({ processor, wallet, token })` with the
   * resulting token — never with a raw card or PayPal login. Left as a
   * clearly labeled gap rather than faked, since there is no real
   * publishable key configured yet to load those SDKs against.
   */
  const attachViaSdk = async (wallet?: WalletType) => {
    setError(`${activeStatus?.name ?? "This processor"} is connected on the server, but its client SDK isn't wired into this screen yet.`);
    void wallet;
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.removePaymentMethod();
      setMethod(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the payment method");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <section className="card">
      <h3>Payment method</h3>
      <p className="small muted">
        One method for everything: rides, secure transport, pharmacy runs, and your plan. Nothing is charged
        when you add it — only when something actually happens, and only up to what that thing costs.
      </p>

      {method && !adding && (
        <>
          <div className="row-between">
            <span className="small">
              {method.wallet ? `${method.wallet === "apple-pay" ? "Apple Pay" : "Google Pay"} — ` : ""}
              {method.brand} ···· {method.last4}
            </span>
            <span className="tiny muted">Exp {String(method.expMonth).padStart(2, "0")}/{method.expYear}</span>
          </div>
          <button className="btn btn-block btn-ghost" disabled={busy} onClick={remove}>Remove</button>
        </>
      )}

      {!method && !adding && (
        <button className="btn btn-block" disabled={busy} onClick={() => setAdding(true)}>Add a payment method</button>
      )}

      {adding && (
        <>
          <div className="tabs" role="tablist">
            {(Object.keys(TAB_LABEL) as Tab[])
              .filter((t) => t !== "apple-pay" || canApplePay || statusOf("stripe")?.mode === "automatic")
              .map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {TAB_LABEL[t]}
                </button>
              ))}
          </div>

          {tab === "card" && (
            <>
              <div className="field">
                <label htmlFor="pm-brand">Card brand</label>
                <select id="pm-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option>Visa</option>
                  <option>Mastercard</option>
                  <option>American Express</option>
                  <option>Discover</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="pm-last4">Last 4 digits</label>
                <input id="pm-last4" inputMode="numeric" maxLength={4} value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="row">
                <div className="field grow">
                  <label htmlFor="pm-month">Exp. month</label>
                  <input id="pm-month" inputMode="numeric" placeholder="MM" maxLength={2} value={expMonth}
                    onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="field grow">
                  <label htmlFor="pm-year">Exp. year</label>
                  <input id="pm-year" inputMode="numeric" placeholder="YYYY" maxLength={4} value={expYear}
                    onChange={(e) => setExpYear(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>
              <div className="row">
                <button className="btn grow" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
                <button className="btn btn-primary grow" disabled={busy || last4.length !== 4 || !expMonth || !expYear} onClick={attachCard}>
                  Save card
                </button>
              </div>
            </>
          )}

          {tab === "apple-pay" && (
            <>
              <p className="small muted">
                {canApplePay
                  ? "Your device supports Apple Pay."
                  : "This browser or device doesn't report Apple Pay support."}
                {" "}{processorReady ? "" : "Stripe isn't connected on this server yet, so it can't be offered for real."}
              </p>
              <button className="btn btn-block btn-primary" disabled={!canApplePay || !processorReady} onClick={() => attachViaSdk("apple-pay")}>
                Pay with Apple Pay
              </button>
            </>
          )}

          {tab === "google-pay" && (
            <>
              <p className="small muted">
                Google Pay's own button checks device support when it loads. {processorReady ? "" : "Stripe isn't connected on this server yet, so it can't be offered for real."}
              </p>
              <button className="btn btn-block btn-primary" disabled={!processorReady} onClick={() => attachViaSdk("google-pay")}>
                Pay with Google Pay
              </button>
            </>
          )}

          {tab === "paypal" && (
            <>
              <p className="small muted">
                {processorReady ? "" : "PayPal isn't connected on this server yet."}
              </p>
              <button className="btn btn-block btn-primary" disabled={!processorReady} onClick={() => attachViaSdk()}>
                Continue with PayPal
              </button>
            </>
          )}

          {tab !== "card" && (
            <button className="btn btn-block btn-ghost" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
          )}
        </>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
