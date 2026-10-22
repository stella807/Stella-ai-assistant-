import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { STRIPE_APPEARANCE } from "../app/stripe-appearance.ts";
import { loadStripeDahlia } from "../native/stripe-checkout.ts";

/**
 * Stripe Checkout's embedded payment form, for subscribing to one plan with
 * a card. The server creates the Checkout Session and returns only its client
 * secret; Stripe draws the form in its own frame and confirms the payment
 * itself, so no card number touches this app.
 */
export function StripeCheckoutForm({ planId, cadence, onClose }: {
  planId: string; cadence: "monthly" | "annual"; onClose: () => void;
}) {
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
      if (loaded.type !== "success") throw new Error(loaded.error.message ?? "Stripe could not load the payment form.");
      form.on("confirm", async (event) => {
        setError(null);
        try {
          await loaded.actions.confirm({ formConfirmEvent: event });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Stripe could not confirm that payment.");
        }
      });
      setState("ready");
    })().catch((e) => {
      if (cancelled) return;
      setState("unavailable");
      setError(e instanceof Error ? e.message : "Stripe could not be reached.");
    });
    return () => { cancelled = true; };
  }, [planId, cadence]);

  return (
    <section className="card stack">
      <h3 style={{ margin: 0 }}>Subscribe with a card</h3>
      <div id="checkout-form" ref={node} />
      {state === "loading" && <p className="small muted">Loading the payment form…</p>}
      {error && <div className="banner banner-danger">{error}</div>}
      <button className="btn btn-block btn-ghost" onClick={onClose}>Cancel</button>
    </section>
  );
}
