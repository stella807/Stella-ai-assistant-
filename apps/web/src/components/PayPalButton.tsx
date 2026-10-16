import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { paypalSdkUrl, setupTokenFromApproval } from "../app/paypal-checkout.ts";

interface PayPalButtons {
  render(target: HTMLElement): Promise<void>;
  close?(): Promise<void>;
}
interface PayPalGlobal {
  Buttons(options: {
    createVaultSetupToken: () => Promise<string>;
    onApprove: (approval: unknown) => Promise<void>;
    onError: (error: unknown) => void;
    onCancel?: () => void;
    style?: Record<string, unknown>;
  }): PayPalButtons;
}

/**
 * PayPal's own button, saving the customer's PayPal account for later without
 * charging anything. The customer approves inside PayPal's window; this
 * component only gets back a one-time setup token, which the server turns
 * into the durable token and verifies with PayPal before keeping anything.
 */
export function PayPalButton({ onToken, onError }: { onToken: (token: string) => void; onError: (message: string) => void }) {
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
    let script: HTMLScriptElement | null = null;
    let buttons: PayPalButtons | null = null;

    (async () => {
      const config = await api.paypalConfig();
      if (cancelled) return;
      if (!config.ready) return setState("unavailable");

      script = document.createElement("script");
      script.src = paypalSdkUrl(config.clientId);
      script.async = true;
      script.onerror = () => { if (!cancelled) setState("unavailable"); };
      script.onload = () => {
        const paypal = (window as unknown as { paypal?: PayPalGlobal }).paypal;
        if (cancelled || !paypal || !mount.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", label: "paypal" },
          createVaultSetupToken: async () => (await api.paypalSetupToken()).id,
          onApprove: async (approval) => {
            const setupToken = setupTokenFromApproval(approval);
            if (!setupToken) return onErrorRef.current("PayPal did not finish saving that account. Nothing was saved.");
            try {
              onTokenRef.current((await api.paypalPaymentToken(setupToken)).token);
            } catch (e) {
              onErrorRef.current(e instanceof Error ? e.message : "PayPal could not save that account.");
            }
          },
          onError: () => onErrorRef.current("PayPal could not save that account. Nothing was saved."),
        });
        void buttons.render(mount.current).then(() => { if (!cancelled) setState("ready"); })
          .catch(() => { if (!cancelled) setState("unavailable"); });
      };
      document.body.appendChild(script);
    })().catch(() => { if (!cancelled) setState("unavailable"); });

    return () => {
      cancelled = true;
      script?.remove();
      void buttons?.close?.();
    };
  }, []);

  return (
    <div>
      <div ref={mount} />
      {state === "loading" && <p className="small muted">Loading PayPal…</p>}
      {state === "unavailable" && <p className="small muted">PayPal couldn't be loaded right now.</p>}
    </div>
  );
}
