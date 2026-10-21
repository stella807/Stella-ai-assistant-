import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import type { CardView } from "../api.ts";

// Lithic's embed is only downloaded when a card is actually opened.
const LithicCardFields = lazy(() => import("./LithicCardFields.tsx"));

/**
 * A task card's number, expiry and CVV, drawn by Lithic's own frames inside
 * this page. The digits come from Lithic straight to those frames; Safehubby's
 * server only hands over a short-lived session for this one card, so no card
 * number ever passes through or is stored by Safehubby.
 */
export function IssuingCardView({ getKey }: {
  getKey: () => Promise<{ cardId: string; view: CardView }>;
}) {
  const [view, setView] = useState<CardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onFieldsError = useCallback((message: string) => setError(message), []);

  useEffect(() => {
    let cancelled = false;
    getKey()
      .then((r) => { if (!cancelled) setView(r.view); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not show the card"); });
    return () => { cancelled = true; };
  }, [getKey]);

  return (
    <div className="card card-quiet stack issuing-card" aria-label="Card details">
      {view && (
        <Suspense fallback={<p className="tiny muted" style={{ margin: 0 }}>Loading from Lithic…</p>}>
          <LithicCardFields session={view.embedSession} environment={view.environment} onError={onFieldsError} />
        </Suspense>
      )}
      {!view && !error && <p className="tiny muted" style={{ margin: 0 }}>Loading the card…</p>}
      {error && <p className="tiny" role="alert" style={{ margin: 0 }}>{error}</p>}
      <p className="tiny muted" style={{ margin: 0 }}>Shown by Lithic. Safehubby never sees or stores this number.</p>
      <details className="wallet-steps">
        <summary className="small">Add it to Apple Wallet</summary>
        <ol className="small" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          <li>Open the <b>Wallet</b> app and tap <b>+</b>.</li>
          <li>Choose <b>Debit or Credit Card</b>, then <b>Enter Card Details Manually</b>.</li>
          <li>Type the number, expiry and CVV shown above. Name: <b>Safehubby</b>.</li>
          <li>If Apple asks for a verification code, ask dispatch for it.</li>
          <li>Pay by holding your iPhone to the reader. Remove the card from Wallet when the task is done — it stops working then anyway.</li>
        </ol>
      </details>
    </div>
  );
}
