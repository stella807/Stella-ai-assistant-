import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { setupTokenFromApproval } from "../app/paypal-checkout.ts";
import { loadPaypal, type PayPalButtons } from "../native/paypal.ts";
import { useLanguage } from "../i18n.tsx";
import { paymentWords } from "../app/payments-copy.ts";

/**
 * PayPal's own button, saving the customer's PayPal account for later without
 * charging anything. The customer approves inside PayPal's window; this
 * component only gets back a one-time setup token, which the server turns
 * into the durable token and verifies with PayPal before keeping anything.
 */
export function PayPalButton({ onToken, onError }: { onToken: (token: string) => void; onError: (message: string) => void }) {
  const { language } = useLanguage();
  const w = paymentWords(language).paypal;
  const wRef = useRef(w);
  wRef.current = w;
  const mount = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  // Held in refs so a new callback from the parent does not tear the button
  // down and redraw it in the middle of an approval.
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let buttons: PayPalButtons | null = null;

    loadPaypal().then((paypal) => {
      if (cancelled) return;
      if (!paypal || !mount.current) return setState("unavailable");
      buttons = paypal.Buttons({
        style: { layout: "vertical", label: "paypal" },
        createVaultSetupToken: async () => (await api.paypalSetupToken("paypal")).id,
        onApprove: async (approval) => {
          const setupToken = setupTokenFromApproval(approval);
          if (!setupToken) return onErrorRef.current(wRef.current.unfinished);
          try {
            onTokenRef.current((await api.paypalPaymentToken(setupToken)).token);
          } catch (e) {
            onErrorRef.current(e instanceof Error ? e.message : wRef.current.failed);
          }
        },
        onError: () => onErrorRef.current(wRef.current.failedNothingSaved),
      });
      void buttons.render(mount.current).then(() => { if (!cancelled) setState("ready"); })
        .catch(() => { if (!cancelled) setState("unavailable"); });
    }).catch(() => { if (!cancelled) setState("unavailable"); });

    return () => {
      cancelled = true;
      void buttons?.close?.();
    };
  }, []);

  return (
    <div>
      <div ref={mount} />
      {state === "loading" && <p className="small muted">{w.loading}</p>}
      {state === "unavailable" && <p className="small muted">{w.unavailable}</p>}
    </div>
  );
}
