import { useEffect, useRef, useState } from "react";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { api } from "../api.ts";
import { loadStripeJs } from "../native/stripe.ts";
import { STRIPE_APPEARANCE } from "../app/stripe-appearance.ts";
import { useLanguage } from "../i18n.tsx";
import { paymentWords, stripeLocale } from "../app/payments-copy.ts";

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
  const { language } = useLanguage();
  const w = paymentWords(language).card;
  const wRef = useRef(w);
  wRef.current = w;
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
      const els = s.elements({ clientSecret, appearance: STRIPE_APPEARANCE, locale: stripeLocale(language) });
      els.create("payment").mount(node.current!);
      stripe.current = s;
      elements.current = els;
      setState("ready");
    })().catch((e) => {
      if (cancelled) return;
      setState("unavailable");
      onErrorRef.current(e instanceof Error ? e.message : wRef.current.unreachable);
    });
    return () => { cancelled = true; };
  }, [language]);

  const save = async () => {
    if (!stripe.current || !elements.current) return;
    setBusy(true);
    try {
      const result = await stripe.current.confirmSetup({
        elements: elements.current,
        confirmParams: { return_url: `${window.location.origin}/#payments` },
        redirect: "if_required",
      });
      if (result.error) throw new Error(result.error.message ?? w.notSaved);
      const method = result.setupIntent?.payment_method;
      if (typeof method !== "string" || !method) throw new Error(w.noId);
      onToken(method);
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : w.notSaved);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div ref={node} style={state === "unavailable" ? { display: "none" } : undefined} />
      {state === "loading" && <p className="small muted">{w.loading}</p>}
      {state === "unavailable" && <p className="small muted">{w.unavailable(paypalOffered)}</p>}
      <div className="row">
        <button className="btn grow" disabled={busy} onClick={onCancel}>{w.cancel}</button>
        <button className="btn btn-primary grow" disabled={busy || state !== "ready"} onClick={save}>
          {busy ? w.saving : w.save}
        </button>
      </div>
    </div>
  );
}
