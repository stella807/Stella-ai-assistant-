/**
 * The checklists, sold to people by card for $0.50 each (the same text agents buy with x402). A test of whether people want
 * the answer without the service around it. The card page is Stripe's own; a checklist is unlocked only when Stripe itself
 * says the session was paid, never because the buyer came back on the success address.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { cardChargingReady, createOneTimeCheckout, readCheckoutSession } from "./adapters/stripe.ts";
import { checklistIndex, checklistText, findChecklist } from "./checklists.ts";

export const PEOPLE_CHECKLIST_CENTS = 50;
const PRICE = "$0.50";
type Lang = "en" | "es";

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

export const isPeopleChecklistPath = (path: string) => path === "/api/people/checklists" || path === "/api/people/checklists/checkout" || path === "/api/people/checklists/paid";

export async function handlePeopleChecklists(req: IncomingMessage, res: ServerResponse, url: URL, origin: string): Promise<void> {
  const lang: Lang = url.searchParams.get("lang") === "es" ? "es" : "en";
  if (url.pathname === "/api/people/checklists" && req.method === "GET") {
    return send(res, 200, { price: PRICE, canPay: cardChargingReady(), checklists: checklistIndex(lang) });
  }
  if (url.pathname === "/api/people/checklists/checkout" && req.method === "POST") {
    const c = findChecklist(url.searchParams.get("slug") ?? "", lang);
    if (!c) return send(res, 404, { error: "No checklist by that name." });
    if (!cardChargingReady()) return send(res, 503, { error: "Card payments are not switched on yet. Write to contact@safehubby.com." });
    const back = `${origin}/checklists${lang === "es" ? "?lang=es" : ""}`;
    const session = await createOneTimeCheckout({
      name: `Safehubby checklist: ${c.title[lang]}`, amountCents: PEOPLE_CHECKLIST_CENTS,
      successUrl: `${origin}/checklists?paid={CHECKOUT_SESSION_ID}${lang === "es" ? "&lang=es" : ""}`, cancelUrl: back,
      metadata: { kind: "checklist", slug: c.slug.en },
    });
    return send(res, 200, { url: session.url });
  }
  if (url.pathname === "/api/people/checklists/paid" && req.method === "GET") {
    const s = await readCheckoutSession(url.searchParams.get("session_id") ?? "");
    if (!s || s.metadata.kind !== "checklist") return send(res, 404, { error: "That purchase was not found." });
    if (!s.paid) return send(res, 402, { error: "This purchase is not paid yet. If you just paid, wait a moment and reload." });
    const c = findChecklist(s.metadata.slug ?? "", "en");
    if (!c) return send(res, 404, { error: "That checklist is no longer offered. Write to contact@safehubby.com." });
    return send(res, 200, { title: c.title[lang], description: c.description[lang], groups: c.groups.map((g) => ({ heading: g.heading[lang], items: g.items.map((i) => i[lang]) })), text: checklistText(c, lang) });
  }
  return send(res, 405, { error: "Not allowed." });
}
