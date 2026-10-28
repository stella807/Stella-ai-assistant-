import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { STRIPE_APPEARANCE } from "../app/stripe-appearance.ts";
import { loadStripeDahlia } from "../native/stripe-checkout.ts";
import { useLanguage } from "../i18n.tsx";
import { paymentWords } from "../app/payments-copy.ts";

/**
 * Stripe Checkout's embedded payment form, for subscribing to one plan with
 * a card. The server creates the Checkout Session and returns only its client
 * secret; Stripe draws the form in its own frame and confirms the payment
 * itself, so no card number touches this app.
 */
export function StripeCheckoutForm({ planId, cadence, onClose }: {
  planId: string; cadence: "monthly" | "annual"; onClose: () => void;
}) {
  const { language } = useLanguage();
  const w = paymentWords(language).checkout;
  const wRef = useRef(w);
  wRef.current = w;
  const node = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stripe = await loadStripeDahlia();
      if (cancelled) return;
      if (!stripe) return setState("unavailable");
      const clientSecret = api.stripeCheckoutSession(planId, cadence).then((json) => json.client_secret);
      const checkout = stripe.initCheckoutFormSdk({ clientSecret, appearance: STRIPE_APPEARANCE });
      const form = checkout.createForm({ layout: "expanded" });
      form.mount(node.current!);
      const loaded = await checkout.loadActions();
      if (cancelled) return;
      if (loaded.type !== "success") throw new Error(loaded.error.message ?? wRef.current.notLoaded);
      form.on("confirm", async (event) => {
        setError(null);
        try {
          await loaded.actions.confirm({ formConfirmEvent: event });
        } catch (e) {
          setError(e instanceof Error ? e.message : wRef.current.notConfirmed);
        }
      });
      setState("ready");
    })().catch((e) => {
      if (cancelled) return;
      setState("unavailable");
      setError(e instanceof Error ? e.message : wRef.current.unreachable);
    });
    return () => { cancelled = true; };
  }, [planId, cadence]);

  return (
    <section className="card stack">
      <h3 style={{ margin: 0 }}>{w.title}</h3>
      <p className="tiny muted" style={{ margin: 0 }}>{w.ivu}</p>
      <div id="checkout-form" ref={node} />
      {state === "loading" && <p className="small muted">{w.loading}</p>}
      {error && <div className="banner banner-danger">{error}</div>}
      <button className="btn btn-block btn-ghost" onClick={onClose}>{w.cancel}</button>
    </section>
  );
}
