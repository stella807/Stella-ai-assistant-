import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import type { CardView } from "../api.ts";
import { loadStripeJs } from "../native/stripe.ts";
import { useLanguage } from "../i18n.tsx";
import { eliteWords } from "../app/elite-copy.ts";

// Lithic's embed is only downloaded when a Lithic card is actually opened.
const LithicCardFields = lazy(() => import("./LithicCardFields.tsx"));

/**
 * A task card's number, expiry and CVC, drawn by the issuer's own frames
 * inside this page — Stripe's Issuing Elements or Lithic's embedded card,
 * whichever issued it. The digits come from the issuer straight to these
 * frames; Safehubby's server only hands over a short-lived key for this one
 * card, so no card number ever passes through or is stored by Safehubby.
 */
export function IssuingCardView({ getKey }: {
  /** Without a nonce: the card's id, and for Lithic already the view. With one: Stripe's key. */
  getKey: (nonce?: string) => Promise<{ cardId: string; view?: CardView }>;
}) {
  const w = eliteWords(useLanguage().language).card;
  const wRef = useRef(w);
  wRef.current = w;
  const number = useRef<HTMLDivElement>(null);
  const expiry = useRef<HTMLDivElement>(null);
  const cvc = useRef<HTMLDivElement>(null);
  const [lithic, setLithic] = useState<Extract<CardView, { provider: "lithic" }> | null>(null);
  const [provider, setProvider] = useState<"stripe" | "lithic" | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFieldsError = useCallback((message: string) => setError(message), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await getKey();
        if (first.view?.provider === "lithic") {
          if (!cancelled) { setProvider("lithic"); setLithic(first.view); setReady(true); }
          return;
        }
        if (!cancelled) setProvider("stripe");
        const s = await loadStripeJs();
        if (!s) throw new Error(wRef.current.notReady);
        const { nonce } = await s.createEphemeralKeyNonce({ issuingCard: first.cardId });
        if (!nonce) throw new Error(wRef.current.notOpened);
        const second = await getKey(nonce);
        const ephemeralKeySecret = second.view?.provider === "stripe" ? second.view.ephemeralKeySecret : undefined;
        if (!ephemeralKeySecret || cancelled) return;
        const elements = s.elements();
        const opts = {
          issuingCard: first.cardId, nonce, ephemeralKeySecret,
          style: { base: { color: "#FBF6EA", fontSize: "20px", letterSpacing: "1px" } },
        };
        // Stripe.js types lag the Issuing element names, so they are created untyped.
        const create = elements.create as unknown as (type: string, o: unknown) => { mount: (el: HTMLElement) => void };
        if (number.current) create("issuingCardNumberDisplay", opts).mount(number.current);
        if (expiry.current) create("issuingCardExpiryDisplay", opts).mount(expiry.current);
        if (cvc.current) create("issuingCardCvcDisplay", opts).mount(cvc.current);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : wRef.current.showFailed);
      }
    })();
    return () => { cancelled = true; };
  }, [getKey]);

  return (
    <div className="card card-quiet stack issuing-card" aria-label={w.details}>
      {lithic ? (
        <Suspense fallback={<p className="tiny muted" style={{ margin: 0 }}>{w.loadingLithic}</p>}>
          <LithicCardFields session={lithic.embedSession} environment={lithic.environment} onError={onFieldsError} />
        </Suspense>
      ) : (
        <div className="stack" style={{ gap: 2, display: provider === "stripe" ? undefined : "none" }}>
          <span className="tiny muted">{w.number}</span>
          <div ref={number} className="issuing-field" />
          <div className="row" style={{ gap: 16 }}>
            <div className="stack grow" style={{ gap: 2 }}><span className="tiny muted">{w.expires}</span><div ref={expiry} className="issuing-field" /></div>
            <div className="stack grow" style={{ gap: 2 }}><span className="tiny muted">{w.cvc}</span><div ref={cvc} className="issuing-field" /></div>
          </div>
        </div>
      )}
      {!ready && !error && <p className="tiny muted" style={{ margin: 0 }}>{w.loading}</p>}
      {error && <p className="tiny" role="alert" style={{ margin: 0 }}>{error}</p>}
      <p className="tiny muted" style={{ margin: 0 }}>{w.shownBy(provider === "lithic" ? "Lithic" : "Stripe")}</p>
      <details className="wallet-steps">
        <summary className="small">{w.wallet}</summary>
        <ol className="small" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          {w.walletSteps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </details>
    </div>
  );
}
