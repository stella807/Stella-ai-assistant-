import { useEffect, useRef, useState } from "react";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { api } from "../api.ts";
import { loadStripeJs } from "../native/stripe.ts";
import { STRIPE_APPEARANCE } from "../app/stripe-appearance.ts";

/**
 * A credit or debit card, saved through Stripe for later without charging it.
 * Stripe's Payment Element draws the fields in its own frame, so the card
 * number never reaches this app or its server; what comes back is a
 * PaymentMethod id the server reads back from Stripe before keeping anything.
 * If the bank asks for 3-D Secure, Stripe shows that step itself.
 */
export function StripeCardForm({ onToken, onError, onCancel, paypalOffered = false }: {
  onToken: (token: string) => void; onError: (message: string) => void; onCancel: () => void;
  /** Whether PayPal is there to fall back on, so the failure message only offers what exists. */
  paypalOffered?: boolean;
}) {
  const node = useRef<HTMLDivElement>(null);
  const stripe = useRef<Stripe | null>(null);
  const elements = useRef<StripeElements | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [busy, setBusy] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await loadStripeJs();
      if (!s) return setState("unavailable");
      const { clientSecret } = await api.stripeSetupIntent();
      if (cancelled) return;
      const els = s.elements({ clientSecret, appearance: STRIPE_APPEARANCE });
      els.create("payment").mount(node.current!);
      stripe.current = s;
      elements.current = els;
      setState("ready");
    })().catch((e) => {
      if (cancelled) return;
      setState("unavailable");
      onErrorRef.current(e instanceof Error ? e.message : "Stripe could not be reached.");
    });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    if (!stripe.current || !elements.current) return;
    setBusy(true);
    try {
      const result = await stripe.current.confirmSetup({
        elements: elements.current,
        confirmParams: { return_url: `${window.location.origin}/#payments` },
        redirect: "if_required",
      });
      if (result.error) throw new Error(result.error.message ?? "Stripe could not save that card.");
      const method = result.setupIntent?.payment_method;
      if (typeof method !== "string" || !method) throw new Error("Stripe saved the card but returned no id for it.");
      onToken(method);
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : "Stripe could not save that card.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div ref={node} style={state === "unavailable" ? { display: "none" } : undefined} />
      {state === "loading" && <p className="small muted">Loading the card form…</p>}
      {state === "unavailable" && (
        <p className="small muted">
          The card form couldn't be loaded right now. Try again in a moment{paypalOffered ? ", or save your PayPal account instead" : ""}.
        </p>
      )}
      <div className="row">
        <button className="btn grow" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary grow" disabled={busy || state !== "ready"} onClick={save}>
          {busy ? "Saving…" : "Save card"}
        </button>
      </div>
    </div>
  );
}
