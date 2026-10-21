import { useEffect, useState } from "react";
import { api, type PaymentMethod, type ProcessorStatus } from "../api.ts";
import { PayPalButton } from "./PayPalButton.tsx";

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
 * The one payment method on the account: a PayPal account. It backs every
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
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [paypal, setPaypal] = useState<ProcessorStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.paymentMethod(), api.paymentProcessors()])
      .then(([m, p]) => {
        setMethod(m.method);
        setPaypal(p.processors.find((x) => x.id === "paypal") ?? null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async (token: string) => {
    const res = await api.attachPaymentMethod({ processor: "paypal", token });
    setMethod(res.method);
    setAdding(false);
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
  const ready = paypal?.mode === "automatic";
  // Nothing on file and nothing that can be added: no card at all.
  if (!method && !ready) return null;

  return (
    <section className="card">
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Payment method</h3>
        <PayPalLogo />
      </div>
      <p className="small muted">
        Pay with your PayPal account for everything: rides, secure transport, pharmacy runs, and your plan.
        Nothing is charged when you add it — only when something actually happens, and only up to what that
        thing costs.
      </p>

      {method && !adding && (
        <>
          <div className="row-between">
            <span className="small row" style={{ gap: 8, alignItems: "center" }}>
              {method.processor === "paypal" && <PayPalLogo mark />}
              {method.accountLabel ?? `${method.brand} ···· ${method.last4}`}
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
        <button className="btn btn-block" disabled={busy} onClick={() => setAdding(true)}>
          Add your PayPal account
        </button>
      )}

      {adding && (
        <>
          <PayPalButton
            onToken={(token) => {
              setBusy(true); setError(null);
              save(token)
                .catch((e) => setError(e instanceof Error ? e.message : "Could not save that account"))
                .finally(() => setBusy(false));
            }}
            onError={setError}
          />
          <button className="btn btn-block btn-ghost" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
        </>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
