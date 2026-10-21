import { Checkout } from "@openreceive/react";
import "@openreceive/react/styles.css";
import { apiBase } from "../native/platform.ts";

/**
 * OpenReceive's checkout for one crypto balance load: a Lightning invoice, or
 * USDT/USDC/SOL/ETH when the server has a swap provider. Its own module so the
 * ~150 kB it adds is only downloaded by someone actually paying in crypto
 * (BalanceCard loads it lazily).
 *
 * The amount is never sent from here: the server prices the reference.
 */
export default function CryptoCheckout({ reference, onSettled }: { reference: string; onSettled: () => void }) {
  return (
    <Checkout
      reference={reference}
      prefix={`${apiBase()}/openreceive`}
      theme="dark"
      themeToggle={false}
      onSettled={onSettled}
      // The session cookie has to travel with every request, including when
      // the app is served from a different origin than the API.
      fetch={(input, init) => fetch(input, { ...init, credentials: "include" })}
    />
  );
}
