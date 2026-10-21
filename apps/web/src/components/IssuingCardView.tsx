import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { stripe } from "../native/stripe.ts";
import type { CardView } from "../api.ts";

// Only someone opening a Lithic card downloads Lithic's embed.
const LithicCardFields = lazy(() => import("./LithicCardFields.tsx"));

/**
 * A task card's number, expiry and CVC, drawn by the issuer's own frames
 * inside this page — Stripe's Issuing Elements, or Lithic's embedded card,
 * whichever the server is set to (`CARD_ISSUER`). The digits come from the
 * issuer straight to these frames; Safehubby's server only hands over a
 * short-lived key for this one card, so no card number ever passes through
 * or is stored by Safehubby.
 */
export function IssuingCardView({ getKey }: {
  /** Without a nonce: the card's id, and for Lithic already the view. With one: Stripe's key. */
  getKey: (nonce?: string) => Promise<{ cardId: string; view?: CardView }>;
}) {
  const number = useRef<HTMLDivElement>(null);
  const expiry = useRef<HTMLDivElement>(null);
  const cvc = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [lithic, setLithic] = useState<Extract<CardView, { provider: "lithic" }> | null>(null);
  const onLithicError = useCallback((message: string) => setError(message), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await getKey();
        if (first.view?.provider === "lithic") {
          if (!cancelled) { setLithic(first.view); setReady(true); }
          return;
        }
        const s = await stripe();
        if (!s) throw new Error("Card details can't be shown until Stripe is set up on this site.");
        const { cardId } = first;
        const { nonce } = await s.createEphemeralKeyNonce({ issuingCard: cardId });
        if (!nonce) throw new Error("Stripe could not open this card.");
        const second = await getKey(nonce);
        const ephemeralKeySecret = second.view?.provider === "stripe" ? second.view.ephemeralKeySecret : undefined;
        if (!ephemeralKeySecret || cancelled) return;
        const elements = s.elements();
        const opts = { issuingCard: cardId, nonce, ephemeralKeySecret, style: { base: { color: "#FBF6EA", fontSize: "20px", letterSpacing: "1px" } } };
        // Stripe.js types lag the Issuing element names, so they are created untyped.
        const create = elements.create as unknown as (type: string, o: unknown) => { mount: (el: HTMLElement) => void };
        if (number.current) create("issuingCardNumberDisplay", opts).mount(number.current);
        if (expiry.current) create("issuingCardExpiryDisplay", opts).mount(expiry.current);
        if (cvc.current) create("issuingCardCvcDisplay", opts).mount(cvc.current);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not show the card");
      }
    })();
    return () => { cancelled = true; };
  }, [getKey]);

  return (
    <div className="card card-quiet stack issuing-card" aria-label="Card details">
      {lithic ? (
        <Suspense fallback={<p className="tiny muted" style={{ margin: 0 }}>Loading from Lithic…</p>}>
          <LithicCardFields session={lithic.embedSession} environment={lithic.environment} onError={onLithicError} />
        </Suspense>
      ) : (
        <>
          <span className="tiny muted">Card number</span>
          <div ref={number} className="issuing-field" />
          <div className="row" style={{ gap: 16 }}>
            <div className="stack grow" style={{ gap: 2 }}><span className="tiny muted">Expires</span><div ref={expiry} className="issuing-field" /></div>
            <div className="stack grow" style={{ gap: 2 }}><span className="tiny muted">CVC</span><div ref={cvc} className="issuing-field" /></div>
          </div>
        </>
      )}
      {!ready && !error && <p className="tiny muted" style={{ margin: 0 }}>Loading the card…</p>}
      {error && <p className="tiny" role="alert" style={{ margin: 0 }}>{error}</p>}
      <p className="tiny muted" style={{ margin: 0 }}>Shown by {lithic ? "Lithic" : "Stripe"}. Safehubby never sees or stores this number.</p>
      <details className="wallet-steps">
        <summary className="small">Add it to Apple Wallet</summary>
        <ol className="small" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          <li>Open the <b>Wallet</b> app and tap <b>+</b>.</li>
          <li>Choose <b>Debit or Credit Card</b>, then <b>Enter Card Details Manually</b>.</li>
          <li>Type the number, expiry and CVC shown above. Name: <b>Safehubby</b>.</li>
          <li>If Apple asks for a verification code, ask dispatch for it.</li>
          <li>Pay by holding your iPhone to the reader. Remove the card from Wallet when the task is done — it stops working then anyway.</li>
        </ol>
      </details>
    </div>
  );
}
