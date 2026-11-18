import type { IncomingMessage, ServerResponse } from "node:http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { lookupVendorsForAgents } from "@safehubby/core";
import { newId, type StoreLike } from "./store.ts";

/**
 * Selling the vendor lookup to other AI agents, paid per request with x402 (USDC).
 *
 * Off unless X402_ENABLED is "true". Test money only: the network defaults to Base Sepolia
 * (eip155:84532), and a real-money network is refused unless X402_ALLOW_MAINNET is "yes", which the owner
 * sets only after deciding to go live. The server holds a receiving address (X402_PAY_TO), never a private
 * key: it cannot send money. The answer is given only after the facilitator has settled the payment.
 */

export const TESTNET = "eip155:84532";
const TESTNETS = new Set([TESTNET, "eip155:11155111"]);
const DESCRIPTION = "Safehubby vendor lookup: event vendors, hotel programs and airport VIP / meet-and-greet services in Puerto Rico, the US and worldwide, with sources. Query: q, category, place, limit (max 25).";

export type AgentSale = { id: string; at: string; network: string; amount: string; payer?: string; transaction?: string; query: string; results: number };

type Config = { payTo: string; network: string; price: string; facilitator: string };

export function x402Config(): Config | { error: string } {
  if (process.env.X402_ENABLED !== "true") return { error: "Paid agent lookups are switched off on this server." };
  const payTo = process.env.X402_PAY_TO?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) return { error: "X402_PAY_TO is not a valid receiving address." };
  const network = process.env.X402_NETWORK?.trim() || TESTNET;
  if (!TESTNETS.has(network) && process.env.X402_ALLOW_MAINNET !== "yes") return { error: "Real-money networks are refused until the owner allows them." };
  return { payTo, network, price: process.env.X402_PRICE?.trim() || "$0.05", facilitator: process.env.X402_FACILITATOR_URL?.trim() || "https://x402.org/facilitator" };
}

let cached: { key: string; server: Promise<x402ResourceServer> } | null = null;
function serverFor(c: Config): Promise<x402ResourceServer> {
  const key = `${c.network}|${c.facilitator}`;
  if (cached?.key !== key) {
    const s = new x402ResourceServer(new HTTPFacilitatorClient({ url: c.facilitator })).register(c.network as `${string}:${string}`, new ExactEvmScheme());
    const ready = s.initialize().then(() => s);
    ready.catch(() => { if (cached?.key === key) cached = null; });
    cached = { key, server: ready };
  }
  return cached.server;
}

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
};

/** GET /api/agent/vendors: free description with ?info, otherwise 402 until paid. */
export async function handleAgentVendors(req: IncomingMessage, res: ServerResponse, url: URL, store: StoreLike, now: () => Date, origin: string): Promise<void> {
  const config = x402Config();
  if ("error" in config) return json(res, 503, { error: config.error });
  if (url.searchParams.has("info")) {
    return json(res, 200, { description: DESCRIPTION, price: config.price, network: config.network, testMoneyOnly: TESTNETS.has(config.network) });
  }
  // Agents read the "Expose-Headers" list in browsers; harmless elsewhere.
  const expose = { "access-control-expose-headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE" };
  let server: x402ResourceServer;
  try { server = await serverFor(config); } catch {
    return json(res, 503, { error: "The payment service could not be reached. Try again later." });
  }
  const requirements = await server.buildPaymentRequirementsFromOptions(
    [{ scheme: "exact", price: config.price, network: config.network as `${string}:${string}`, payTo: config.payTo }], {},
  );
  const resource = { url: `${origin}${url.pathname}`, description: DESCRIPTION, mimeType: "application/json" };
  const ask = async (error?: string) => {
    const required = await server.createPaymentRequiredResponse(requirements, resource, error);
    return json(res, 402, required, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required), ...expose });
  };

  const header = req.headers["payment-signature"];
  const signature = Array.isArray(header) ? header[0] : header;
  if (!signature) return ask();
  let payload;
  try { payload = decodePaymentSignatureHeader(signature); } catch { return ask("The payment header could not be read."); }
  const match = server.findMatchingRequirements(requirements, payload);
  if (!match) return ask("That payment does not match the price, network or address asked for.");
  const verified = await server.verifyPayment(payload, match);
  if (!verified.isValid) return ask(`Payment not valid: ${verified.invalidReason ?? "unknown reason"}`);

  const query = { q: url.searchParams.get("q") ?? "", category: url.searchParams.get("category") ?? "", place: url.searchParams.get("place") ?? "", limit: Number(url.searchParams.get("limit")) || 10 };
  const found = lookupVendorsForAgents(query);
  // Settled before the answer goes out, so nothing is given away on a payment that fails.
  const settled = await server.settlePayment(payload, match);
  if (!settled.success) return ask(`Payment could not be settled: ${settled.errorReason ?? "unknown reason"}`);
  const sale: AgentSale = {
    id: newId("sal"), at: now().toISOString(), network: config.network, amount: match.amount,
    payer: settled.payer, transaction: settled.transaction, query: JSON.stringify(query).slice(0, 300), results: found.results.length,
  };
  store.update((db) => { db.agentSales = [...(db.agentSales ?? []), sale].slice(-5000); });
  return json(res, 200, found, { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled), ...expose });
}
