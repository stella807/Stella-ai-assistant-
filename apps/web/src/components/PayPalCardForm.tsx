import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { setupTokenFromApproval } from "../app/paypal-checkout.ts";
import { loadPaypal, type PayPalCardFields } from "../native/paypal.ts";

/**
 * A Visa, Mastercard or other card, saved through PayPal for later without
 * charging anything. The four fields are PayPal's own, drawn in PayPal's
 * frames inside this page, so the card number never reaches this app or its
 * server. If the bank asks for 3-D Secure, PayPal shows that step itself.
 * What comes back is a one-time setup token, which the server turns into the
 * saved token and reads back from PayPal (brand, last four, expiry) before
 * keeping anything.
 */
export function PayPalCardForm({ onToken, onError, onCancel }: {
  onToken: (token: string) => void; onError: (message: string) => void; onCancel: () => void;
}) {
  const name = useRef<HTMLDivElement>(null);
  const number = useRef<HTMLDivElement>(null);
  const expiry = useRef<HTMLDivElement>(null);
  const cvv = useRef<HTMLDivElement>(null);
  const fields = useRef<PayPalCardFields | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [busy, setBusy] = useState(false);

  // Held in refs so a new callback from the parent does not redraw the fields
  // in the middle of someone typing a card.
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    loadPaypal().then(async (paypal) => {
      if (cancelled) return;
      if (!paypal) return setState("unavailable");
      const card = paypal.CardFields({
        createVaultSetupToken: async () => (await api.paypalSetupToken("card")).id,
        onApprove: async (approval) => {
          const setupToken = setupTokenFromApproval(approval);
          if (!setupToken) {
            setBusy(false);
            return onErrorRef.current("PayPal did not finish saving that card. Nothing was saved.");
          }
          try {
            onTokenRef.current((await api.paypalPaymentToken(setupToken)).token);
          } catch (e) {
            onErrorRef.current(e instanceof Error ? e.message : "PayPal could not save that card.");
          } finally {
            setBusy(false);
          }
        },
        onError: () => { setBusy(false); onErrorRef.current("PayPal could not save that card. Check the details and try again."); },
        style: { input: { "font-size": "16px", color: "#1a1a1a" } },
      });
      // PayPal decides whether card fields are offered for this merchant and
      // browser; when they are not, say so rather than draw empty boxes.
      if (!card.isEligible()) return setState("unavailable");
      fields.current = card;
      await Promise.all([
        card.NameField({ placeholder: "Name on card" }).render(name.current!),
        card.NumberField().render(number.current!),
        card.ExpiryField().render(expiry.current!),
        card.CVVField().render(cvv.current!),
      ]);
      if (!cancelled) setState("ready");
    }).catch(() => { if (!cancelled) setState("unavailable"); });
    return () => { cancelled = true; fields.current = null; };
  }, []);

  const save = async () => {
    if (!fields.current) return;
    setBusy(true);
    try {
      await fields.current.submit();
    } catch {
      // A field PayPal flagged (an incomplete number, a past expiry) — its own
      // frames already show which one.
      setBusy(false);
      onErrorRef.current("Check the card details and try again.");
    }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="tiny muted" style={{ margin: 0 }}>Visa, Mastercard and other major cards, through PayPal.</p>
      <div className="paypal-card-fields" style={state === "unavailable" ? { display: "none" } : undefined}>
        <div ref={name} />
        <div ref={number} />
        <div className="row" style={{ gap: 8 }}>
          <div ref={expiry} className="grow" />
          <div ref={cvv} className="grow" />
        </div>
      </div>
      {state === "loading" && <p className="small muted">Loading the card form…</p>}
      {state === "unavailable" && <p className="small muted">The card form couldn't be loaded right now. You can save your PayPal account instead.</p>}
      <div className="row">
        <button className="btn grow" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary grow" disabled={busy || state !== "ready"} onClick={save}>
          {busy ? "Saving…" : "Save card"}
        </button>
      </div>
    </div>
  );
}
