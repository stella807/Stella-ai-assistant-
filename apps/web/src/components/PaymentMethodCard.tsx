import { useEffect, useState } from "react";
import { api, type PaymentMethod } from "../api.ts";

/**
 * The one card on the account. It backs every charge that is not a store-billed
 * subscription: rides, secure transport, pharmacy runs, and the subscription
 * itself on the web. Adding one does not charge anything by itself — it lets a
 * hold be placed at the moment a trip is actually booked, and Safehubby never
 * spends before that hold exists.
 *
 * There is no real card processor wired in yet (see docs/billing.md), so this
 * form is a stand-in for whatever replaces it — Stripe's card element, most
 * likely — and stores only the last four digits and an expiry, which is all a
 * real integration would ever hand back to the browser either way.
 */
export function PaymentMethodCard() {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [brand, setBrand] = useState("Visa");
  const [last4, setLast4] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.paymentMethod()
      .then((r) => setMethod(r.method))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const attach = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.attachPaymentMethod(brand, last4.trim(), Number(expMonth), Number(expYear));
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

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.removePaymentMethod();
      setMethod(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the card");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <section className="card">
      <h3>Card on file</h3>
      <p className="small muted">
        One card for everything: rides, secure transport, pharmacy runs, and your plan. Nothing is charged
        when you add it — only when something actually happens, and only up to what that thing costs.
      </p>

      {method && !adding && (
        <>
          <div className="row-between">
            <span className="small">{method.brand} ···· {method.last4}</span>
            <span className="tiny muted">Exp {String(method.expMonth).padStart(2, "0")}/{method.expYear}</span>
          </div>
          <button className="btn btn-block btn-ghost" disabled={busy} onClick={remove}>Remove card</button>
        </>
      )}

      {!method && !adding && (
        <button className="btn btn-block" disabled={busy} onClick={() => setAdding(true)}>Add a card</button>
      )}

      {adding && (
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
            <button className="btn btn-primary grow" disabled={busy || last4.length !== 4 || !expMonth || !expYear} onClick={attach}>
              Save card
            </button>
          </div>
        </>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
