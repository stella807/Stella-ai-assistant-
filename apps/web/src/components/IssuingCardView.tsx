import { useEffect, useRef, useState } from "react";
import { stripe } from "../native/stripe.ts";

/**
 * A task card's number, expiry and CVC, drawn by Stripe's own Issuing
 * Elements inside this page. The digits come from Stripe straight to these
 * frames — Safehubby's server only hands over a short-lived key for this one
 * card — so no card number ever passes through or is stored by Safehubby.
 */
export function IssuingCardView({ getKey }: {
  /** Without a nonce: the card's id. With one: a key for it. */
  getKey: (nonce?: string) => Promise<{ cardId: string; ephemeralKeySecret?: string }>;
}) {
  const number = useRef<HTMLDivElement>(null);
  const expiry = useRef<HTMLDivElement>(null);
  const cvc = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await stripe();
        if (!s) throw new Error("Card details can't be shown until Stripe is set up on this site.");
        const { cardId } = await getKey();
        const { nonce } = await s.createEphemeralKeyNonce({ issuingCard: cardId });
        if (!nonce) throw new Error("Stripe could not open this card.");
        const { ephemeralKeySecret } = await getKey(nonce);
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
      <span className="tiny muted">Card number</span>
      <div ref={number} className="issuing-field" />
      <div className="row" style={{ gap: 16 }}>
        <div className="stack grow" style={{ gap: 2 }}><span className="tiny muted">Expires</span><div ref={expiry} className="issuing-field" /></div>
        <div className="stack grow" style={{ gap: 2 }}><span className="tiny muted">CVC</span><div ref={cvc} className="issuing-field" /></div>
      </div>
      {!ready && !error && <p className="tiny muted" style={{ margin: 0 }}>Loading from Stripe…</p>}
      {error && <p className="tiny" role="alert" style={{ margin: 0 }}>{error}</p>}
      <p className="tiny muted" style={{ margin: 0 }}>Shown by Stripe. Safehubby never sees or stores this number.</p>
    </div>
  );
}
