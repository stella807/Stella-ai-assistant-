import { useEffect, useRef, useState } from "react";
import {
  api, type PayBrand, type PaymentMethod, type PaymentProcessor, type ProcessorStatus,
} from "../api.ts";
import {
  availableWallets, isStripeConfigured, stripe, walletRequest, type StripeCardElement,
} from "../native/stripe.ts";

type Tab = "card" | "paypal" | "ath-movil" | PayBrand;

/**
 * How the browser half of each option is actually produced today. This is
 * the honest half of the screen: the server can be fully configured for a
 * method whose checkout SDK is not loaded here yet, and saying "not
 * available" would blame the wrong side.
 *
 * - `card` / `payment-request` are wired, through Stripe.js (see native/stripe.ts).
 * - `sdk-pending` means the server adapter is ready and the vendor's own
 *   client SDK is not loaded on this screen. Klarna, Affirm, Afterpay, Cash
 *   App, Link and Amazon Pay all need Stripe's Payment Element rather than
 *   the Card Element this screen mounts; PayPal needs its own JS SDK; ATH
 *   Móvil needs Evertec's Payment Button script.
 */
type Wiring = "card" | "payment-request" | "sdk-pending";

/**
 * Every option the screen offers, and what sits behind each one.
 *
 * `processor` is the account that actually settles it, and most of these
 * share one: Klarna, Amazon Pay, Cash App, Affirm, Afterpay and Link are
 * brands Stripe surfaces on the Stripe account this app already has, not
 * integrations of their own, so they carry `brand` and settle as `stripe`.
 * Venmo is the same story on PayPal's side. Only ATH Móvil is a genuinely
 * separate backend — see `PayBrand` and `PaymentProcessor` in core's
 * payment.ts, which this table mirrors rather than redefines.
 *
 * Mastercard is deliberately absent: it is a card network the Card tab
 * already accepts, not a method of its own. The network list lives beside
 * the card form.
 */
const TABS: { id: Tab; label: string; processor: PaymentProcessor; brand?: PayBrand; wiring: Wiring }[] = [
  { id: "card", label: "Card", processor: "stripe", wiring: "card" },
  { id: "apple-pay", label: "Apple Pay", processor: "stripe", brand: "apple-pay", wiring: "payment-request" },
  { id: "google-pay", label: "Google Pay", processor: "stripe", brand: "google-pay", wiring: "payment-request" },
  { id: "klarna", label: "Klarna", processor: "stripe", brand: "klarna", wiring: "sdk-pending" },
  { id: "amazon-pay", label: "Amazon Pay", processor: "stripe", brand: "amazon-pay", wiring: "sdk-pending" },
  { id: "cashapp", label: "Cash App Pay", processor: "stripe", brand: "cashapp", wiring: "sdk-pending" },
  { id: "affirm", label: "Affirm", processor: "stripe", brand: "affirm", wiring: "sdk-pending" },
  { id: "afterpay-clearpay", label: "Afterpay", processor: "stripe", brand: "afterpay-clearpay", wiring: "sdk-pending" },
  { id: "link", label: "Link", processor: "stripe", brand: "link", wiring: "sdk-pending" },
  { id: "paypal", label: "PayPal", processor: "paypal", wiring: "sdk-pending" },
  { id: "venmo", label: "Venmo", processor: "paypal", brand: "venmo", wiring: "sdk-pending" },
  { id: "ath-movil", label: "ATH Móvil", processor: "ath-movil", wiring: "sdk-pending" },
];

const TAB = Object.fromEntries(TABS.map((t) => [t.id, t])) as Record<Tab, (typeof TABS)[number]>;

/**
 * The one payment method on the account. It backs every charge that is not a
 * store-billed subscription: rides, secure transport, pharmacy runs, and the
 * subscription itself on the web. Adding one does not charge anything by
 * itself — it lets a hold be placed at the moment a trip is actually booked,
 * and Safehubby never spends before that hold exists.
 *
 * Twelve options, three real backends — see `TABS` above for which is which.
 * Stripe, PayPal and ATH Móvil are independent processors with their own
 * credentials (adapters/stripe.ts, paypal.ts, ath-movil.ts); everything else
 * on the row is a brand one of those three surfaces, settled by it and
 * recorded in `payWith` for display only.
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
  const [cardNetworks, setCardNetworks] = useState<string[]>([]);
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
        setCardNetworks(p.cardNetworks);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

    // Straight from Stripe rather than sniffed off the user agent. Resolves
    // to both-false when Stripe isn't configured, which is the honest answer.
    availableWallets().then(setWallets).catch(() => {});
  }, []);

  const statusOf = (processor: PaymentProcessor) => processors.find((p) => p.id === processor) ?? null;
  const active = TAB[tab];
  const activeStatus = statusOf(active.processor);
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
  const attachWallet = async (payWith: PayBrand) => {
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
      await save({ processor: "stripe", payWith, token });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that wallet");
    } finally {
      setBusy(false);
    }
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

  /**
   * Why a tab can't be completed right now, in the user's terms — and whose
   * side the gap is on. Server credentials, this build's keys, this device,
   * and an unloaded vendor SDK are four different problems, and collapsing
   * them into one "unavailable" would leave nobody able to act on it.
   */
  const blockedReason = (): string | null => {
    if (activeStatus?.mode !== "automatic") {
      // Name the processor, not the tab: "Card isn't connected" is not a
      // thing that can be true, and for a brand it is worth saying whose
      // rails it is actually waiting on — that is the account the operator
      // has to go and connect.
      const name = activeStatus?.name ?? active.label;
      const lead = active.brand && name !== active.label
        ? `${active.label} settles through ${name}, which isn't connected on this server yet`
        : `${name} isn't connected on this server yet`;
      // The `requires` strings are written as standalone sentences by each
      // adapter, so they arrive capitalised and full-stopped; both are wrong
      // once they continue a clause here.
      const needs = activeStatus?.requires?.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase());
      return `${lead}${needs ? ` — needs ${needs}.` : "."}`;
    }
    if (active.processor === "stripe" && !isStripeConfigured()) {
      return "This build has no Stripe publishable key — see docs/billing.md.";
    }
    if (tab === "apple-pay" && !wallets.applePay) {
      return "Apple Pay needs Safari on an iPhone, iPad, or Mac — this browser doesn't offer it.";
    }
    if (tab === "google-pay" && !wallets.googlePay) {
      return "Google Pay isn't available in this browser, or has no card saved in it.";
    }
    if (active.wiring === "sdk-pending") {
      return `${active.label}'s server side is ready, but its checkout isn't wired into this screen yet.`;
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
              {method.payWith ? `${TAB[method.payWith]?.label ?? method.payWith} — ` : ""}
              {method.brand} ···· {method.last4}
            </span>
            {/* An account-based method has no card behind it and so no
                expiry — see PaymentMethodOnFile in core's payment.ts. */}
            {method.expMonth !== undefined && method.expYear !== undefined && (
              <span className="tiny muted">Exp {String(method.expMonth).padStart(2, "0")}/{method.expYear}</span>
            )}
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
          <div className="tabs tabs-scroll" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {blocked && <p className="small muted">{blocked}</p>}

          {tab === "card" && (
            <>
              {/* Served rather than hardcoded — CARD_NETWORKS in core's
                  payment.ts. Mastercard is accepted here, on this tab, which
                  is the whole of what "supporting Mastercard" means. */}
              {cardNetworks.length > 0 && (
                <p className="tiny muted" style={{ margin: 0 }}>
                  We accept {cardNetworks.join(", ")}.
                </p>
              )}
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

          {active.wiring === "payment-request" && (
            <>
              <button className="btn btn-block btn-primary" disabled={busy || Boolean(blocked)}
                onClick={() => attachWallet(active.brand!)}>
                Pay with {active.label}
              </button>
              <button className="btn btn-block btn-ghost" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
            </>
          )}

          {/* The button stays, disabled, rather than disappearing: the
              blocked reason above names what is missing, and an option that
              vanishes reads as one that doesn't exist. */}
          {active.wiring === "sdk-pending" && (
            <>
              <button className="btn btn-block btn-primary" disabled aria-disabled="true">
                Continue with {active.label}
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
