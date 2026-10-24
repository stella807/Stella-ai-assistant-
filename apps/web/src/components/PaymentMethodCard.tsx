import { useEffect, useState } from "react";
import { api, type PaymentMethod, type ProcessorStatus } from "../api.ts";
import { PayPalButton } from "./PayPalButton.tsx";
import { StripeCardForm } from "./StripeCardForm.tsx";
import { useLanguage } from "../i18n.tsx";
import { paymentWords } from "../app/payments-copy.ts";

/**
 * PayPal's own logo, the files PayPal itself serves (public/img/paypal-logo.svg
 * and paypal-mark.svg), never redrawn or recoloured. The full-colour logo has a
 * dark-blue "Pay" that vanishes on this app's dark background, so it sits on a
 * white chip, which is how PayPal's brand guidelines have it used.
 */
function PayPalLogo({ mark = false }: { mark?: boolean }) {
  return (
    <span className="paypal-chip">
      <img src={mark ? "/img/paypal-mark.svg" : "/img/paypal-logo.svg"} alt="PayPal" height={mark ? 22 : 24}
        width={mark ? 22 : 85} />
    </span>
  );
}

/**
 * The one payment method on the account: a card (Visa, Mastercard and the
 * other major cards), saved through Stripe, or a PayPal account. It backs every
 * charge that is not a store-billed subscription — rides, secure transport,
 * pharmacy runs, and the subscription itself on the web. Adding one does not
 * charge anything by itself — it lets a hold be placed at the moment a trip is
 * actually booked, and Safehubby never spends before that hold exists.
 *
 * PayPal's own button does the approving inside PayPal's window; this app
 * never touches a PayPal login or a card number. What it sends to its own
 * server is the payment token PayPal hands back, which the server then
 * re-verifies against PayPal's API rather than trusting the browser's claim
 * about it. ATH Móvil and crypto are not here: they load the prepaid balance
 * above this card instead (BalanceCard.tsx).
 *
 * With PayPal not connected on the server and nothing on file, the card is
 * left off the screen rather than showing a button that cannot finish. See
 * docs/billing.md.
 */
export function PaymentMethodCard() {
  const { language } = useLanguage();
  const w = paymentWords(language).method;
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [paypal, setPaypal] = useState<ProcessorStatus | null>(null);
  const [stripe, setStripe] = useState<ProcessorStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** What is being added: a typed card, or a PayPal account. */
  const [adding, setAdding] = useState<"card" | "paypal" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.paymentMethod(), api.paymentProcessors()])
      .then(([m, p]) => {
        setMethod(m.method);
        setPaypal(p.processors.find((x) => x.id === "paypal") ?? null);
        setStripe(p.processors.find((x) => x.id === "stripe") ?? null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async (token: string, processor: "paypal" | "stripe" = "paypal") => {
    const res = await api.attachPaymentMethod({ processor, token });
    setMethod(res.method);
    setAdding(null);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.removePaymentMethod();
      setMethod(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : w.removeFailed);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;
  const paypalReady = paypal?.mode === "automatic";
  // Cards are saved through Stripe only; PayPal saves PayPal accounts.
  const stripeReady = stripe?.mode === "automatic";
  const ready = paypalReady || stripeReady;
  // Nothing on file and nothing that can be added: no card at all.
  if (!method && !ready) return null;

  return (
    <section className="card">
      <div className="row-between">
        <h3 style={{ margin: 0 }}>{w.title}</h3>
        {paypalReady && <PayPalLogo />}
      </div>
      <p className="small muted">{w.intro(paypalReady)}</p>

      {method && !adding && (
        <>
          <div className="row-between">
            <span className="small row" style={{ gap: 8, alignItems: "center" }}>
              {method.accountLabel && <PayPalLogo mark />}
              {method.accountLabel ?? `${method.brand} ···· ${method.last4}`}
            </span>
            {/* An account-based method has no card behind it and so no
                expiry — see PaymentMethodOnFile in core's payment.ts. */}
            {method.expMonth !== undefined && method.expYear !== undefined && (
              <span className="tiny muted">{w.exp} {String(method.expMonth).padStart(2, "0")}/{method.expYear}</span>
            )}
          </div>
          <button className="btn btn-block btn-ghost" disabled={busy} onClick={remove}>{w.remove}</button>
        </>
      )}

      {!method && !adding && (
        <div className="stack" style={{ gap: 8 }}>
          {/* Cards go through Stripe only; PayPal is offered for PayPal accounts. */}
          {stripeReady && (
            <>
              <p className="tiny muted" style={{ margin: 0 }}>{w.brands}</p>
              <button className="btn btn-block btn-primary" disabled={busy} onClick={() => { setError(null); setAdding("card"); }}>
                {w.addCard}
              </button>
            </>
          )}
          {paypalReady && (
            <button className="btn btn-block" disabled={busy} onClick={() => { setError(null); setAdding("paypal"); }}>
              {w.addPaypal}
            </button>
          )}
        </div>
      )}

      {adding === "card" && stripeReady && (
        <StripeCardForm
          paypalOffered={paypalReady}
          onToken={(token) => {
            setBusy(true); setError(null);
            save(token, "stripe")
              .catch((e) => setError(e instanceof Error ? e.message : w.cardFailed))
              .finally(() => setBusy(false));
          }}
          onError={setError}
          onCancel={() => setAdding(null)}
        />
      )}

      {adding === "paypal" && (
        <>
          <PayPalButton
            onToken={(token) => {
              setBusy(true); setError(null);
              save(token)
                .catch((e) => setError(e instanceof Error ? e.message : w.accountFailed))
                .finally(() => setBusy(false));
            }}
            onError={setError}
          />
          <button className="btn btn-block btn-ghost" disabled={busy} onClick={() => setAdding(null)}>{w.cancel}</button>
        </>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
