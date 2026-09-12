import { useEffect, useRef, useState } from "react";
import { api, type PaymentMethod, type PaymentProcessor, type ProcessorStatus, type WalletType } from "../api.ts";
import {
  availableWallets, isStripeConfigured, stripe, walletRequest, type StripeCardElement,
} from "../native/stripe.ts";

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
 *  way the plain "Card" tab does. See adapters/stripe.ts. */
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
 * Four tabs, two real backends. Stripe and PayPal are independent processors
 * with their own credentials (adapters/stripe.ts, adapters/paypal.ts). Apple
 * Pay and Google Pay are wallets Stripe's own SDK offers on top of the same
 * card rails, so they settle as `stripe` with `wallet` recorded for display.
 *
 * Card entry and the wallet sheets all happen inside Stripe.js — this app
 * never touches a raw card number. What it sends to its own server is the
 * PaymentMethod id Stripe hands back, which the server then re-verifies
 * against Stripe's API rather than trusting the browser's claim about it.
 *
 * Two independent things have to be configured for any of this to work, and
 * the UI distinguishes them instead of showing one vague failure:
 * `VITE_STRIPE_PUBLISHABLE_KEY` in this build (checked via
 * `isStripeConfigured`), and the secret key on the server (reported by
 * `GET /api/payment/processors`). With either missing, the tabs say so and
 * Card falls back to the typed-in stand-in form this screen has always had.
 * See docs/billing.md.
 */
export function PaymentMethodCard() {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [processors, setProcessors] = useState<ProcessorStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<Tab>("card");
  const [wallets, setWallets] = useState({ applePay: false, googlePay: false });
  const [brand, setBrand] = useState("Visa");
  const [last4, setLast4] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardMount = useRef<HTMLDivElement>(null);
  const cardElement = useRef<StripeCardElement | null>(null);

  useEffect(() => {
    Promise.all([api.paymentMethod(), api.paymentProcessors()])
      .then(([m, p]) => {
        setMethod(m.method);
        setProcessors(p.processors);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

    // Straight from Stripe rather than sniffed off the user agent. Resolves
    // to both-false when Stripe isn't configured, which is the honest answer.
    availableWallets().then(setWallets).catch(() => {});
  }, []);

  const statusOf = (processor: PaymentProcessor) => processors.find((p) => p.id === processor) ?? null;
  const activeStatus = statusOf(PROCESSOR_FOR[tab]);
  /** Both halves present: this build has the publishable key, and the server
   *  has the secret key to verify the resulting token with. */
  const stripeLive = isStripeConfigured() && statusOf("stripe")?.mode === "automatic";

  // Stripe's Card Element has to be mounted into a real node, so it can only
  // be created once the Card tab is actually on screen.
  useEffect(() => {
    if (!adding || tab !== "card" || !stripeLive || !cardMount.current) return;
    let unmounted = false;
    stripe().then((s) => {
      if (!s || unmounted || !cardMount.current) return;
      const element = s.elements().create("card");
      element.mount(cardMount.current);
      cardElement.current = element;
    });
    return () => {
      unmounted = true;
      cardElement.current?.unmount();
      cardElement.current = null;
    };
  }, [adding, tab, stripeLive]);

  const save = async (input: Parameters<typeof api.attachPaymentMethod>[0]) => {
    const res = await api.attachPaymentMethod(input);
    setMethod(res.method);
    setAdding(false);
    setLast4("");
    setExpMonth("");
    setExpYear("");
  };

  /** Stripe.js tokenizes the typed card in its own iframe; only the resulting
   *  PaymentMethod id reaches this app or its server. */
  const attachStripeCard = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await stripe();
      if (!s || !cardElement.current) throw new Error("Stripe didn't finish loading. Try again.");
      const { error: stripeError, paymentMethod } = await s.createPaymentMethod({
        type: "card", card: cardElement.current,
      });
      if (stripeError || !paymentMethod) throw new Error(stripeError?.message ?? "Stripe could not read that card.");
      await save({ processor: "stripe", token: paymentMethod.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that card");
    } finally {
      setBusy(false);
    }
  };

  /** The stand-in for builds with no Stripe key: stores a brand and last 4
   *  only, exactly as this screen did before Stripe existed. */
  const attachTypedCard = async () => {
    setBusy(true);
    setError(null);
    try {
      await save({
        processor: "stripe", brand, last4: last4.trim(), expMonth: Number(expMonth), expYear: Number(expYear),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that card");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Apple Pay and Google Pay both go through Stripe's Payment Request sheet.
   * The sheet needs a total, so `walletRequest` asks for zero and never
   * confirms a payment — the point is the tokenized method it hands back,
   * which later holds are placed against at booking time.
   */
  const attachWallet = async (wallet: WalletType) => {
    setBusy(true);
    setError(null);
    try {
      const request = await walletRequest();
      if (!request) throw new Error("Stripe isn't configured in this build.");
      const supported = await request.canMakePayment();
      if (!supported) throw new Error("This device can't complete that wallet.");

      const token = await new Promise<string>((resolve, reject) => {
        request.on("paymentmethod", (event) => {
          event.complete("success");
          resolve(event.paymentMethod.id);
        });
        request.on("cancel", () => reject(new Error("Cancelled.")));
        request.show();
      });
      await save({ processor: "stripe", wallet, token });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that wallet");
    } finally {
      setBusy(false);
    }
  };

  /**
   * PayPal's own JS SDK is not wired in yet — unlike Stripe, which is fully
   * connected above, this is still a labeled gap. The server side
   * (adapters/paypal.ts) is ready to verify a vaulted payment-token id; what
   * is missing is loading PayPal's SDK to produce one, which needs a real
   * PayPal REST app's client id.
   */
  const attachPaypal = () => {
    setError("PayPal's server side is ready, but its checkout SDK isn't wired into this screen yet.");
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

  /** Why a tab can't be completed right now, in the user's terms. */
  const blockedReason = (): string | null => {
    if (PROCESSOR_FOR[tab] === "paypal") {
      return activeStatus?.mode === "automatic" ? null : "PayPal isn't connected on this server yet.";
    }
    if (!isStripeConfigured()) return "This build has no Stripe publishable key — see docs/billing.md.";
    if (statusOf("stripe")?.mode !== "automatic") return "Stripe isn't connected on this server yet.";
    if (tab === "apple-pay" && !wallets.applePay) {
      return "Apple Pay needs Safari on an iPhone, iPad, or Mac — this browser doesn't offer it.";
    }
    if (tab === "google-pay" && !wallets.googlePay) {
      return "Google Pay isn't available in this browser, or has no card saved in it.";
    }
    return null;
  };
  const blocked = blockedReason();

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
          {/* All four are always listed, including ones this browser or
              server can't complete right now. A hidden option tells the
              reader nothing; a visible one that states plainly why it won't
              work tells them whether the problem is their device or our
              setup. */}
          <div className="tabs" role="tablist">
            {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {blocked && <p className="small muted">{blocked}</p>}

          {tab === "card" && (
            <>
              {stripeLive ? (
                <>
                  {/* Stripe.js renders the real card fields into this node,
                      inside its own iframe — the inputs are never ours. */}
                  <div className="field"><div ref={cardMount} /></div>
                  <div className="row">
                    <button className="btn grow" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
                    <button className="btn btn-primary grow" disabled={busy} onClick={attachStripeCard}>
                      Save card
                    </button>
                  </div>
                </>
              ) : (
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
                    <button className="btn btn-primary grow"
                      disabled={busy || last4.length !== 4 || !expMonth || !expYear} onClick={attachTypedCard}>
                      Save card
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {(tab === "apple-pay" || tab === "google-pay") && (
            <>
              <button className="btn btn-block btn-primary" disabled={busy || Boolean(blocked)}
                onClick={() => attachWallet(tab === "apple-pay" ? "apple-pay" : "google-pay")}>
                {tab === "apple-pay" ? "Pay with Apple Pay" : "Pay with Google Pay"}
              </button>
              <button className="btn btn-block btn-ghost" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
            </>
          )}

          {tab === "paypal" && (
            <>
              <button className="btn btn-block btn-primary" disabled={busy || Boolean(blocked)} onClick={attachPaypal}>
                Continue with PayPal
              </button>
              <button className="btn btn-block btn-ghost" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
            </>
          )}
        </>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
