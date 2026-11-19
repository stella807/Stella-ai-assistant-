/**
 * A page an agent can show the person it works for, so the person can decide whether to let the agent spend a little.
 * Prices come from the live settings, never from here, so the page cannot disagree with what is charged.
 */
import { CONTACT_EMAIL } from "@safehubby/core";

export interface ApprovalInput {
  origin: string; lang: "en" | "es";
  pass: { price: string; length: string };
  items: { id: string; title: string; price: string }[];
}

export function buildApprovalPack({ origin, lang, pass, items }: ApprovalInput) {
  const en = lang === "en";
  const t = (a: string, b: string) => (en ? a : b);
  const limits = [
    t("Set a spending limit on the wallet or payment tool the agent uses: a per-request maximum and a daily maximum. A few dollars a day is plenty for everything listed here.",
      "Ponga un límite de gasto en la cartera o herramienta de pago que usa el agente: un máximo por pedido y un máximo por día. Unos pocos dólares al día alcanzan para todo lo que aparece aquí."),
    t("A request that cannot be answered is refused before any money moves, so you are not charged for it.",
      "Un pedido que no se puede responder se rechaza antes de mover dinero, así que no se cobra."),
    t("Every payment is small, in USDC on the Base network, and visible on the public record of that network.",
      "Cada pago es pequeño, en USDC en la red Base, y se ve en el registro público de esa red."),
  ];
  const lines = [
    t("Safehubby: what your agent may buy, and what it costs", "Safehubby: qué puede comprar su agente y cuánto cuesta"),
    "",
    t("Safehubby is a concierge and errands service in Puerto Rico. Its store for AI agents sells small, checkable pieces of information. Nothing here needs a person to do work, and nothing is medical, legal or financial advice.",
      "Safehubby es un servicio de conserjería y mandados en Puerto Rico. Su tienda para agentes de IA vende piezas pequeñas de información que se pueden comprobar. Nada aquí requiere que una persona haga un trabajo, y nada es consejo médico, legal ni financiero."),
    "",
    t(`Site pass: ${pass.price} for ${pass.length}. It covers the website's pages, facts, blog articles, the digest, the brief, the airport directory, checklists, the request check and the alerts feed. Books cost extra.`,
      `Pase del sitio: ${pass.price} por ${pass.length}. Cubre las páginas del sitio, los datos, los artículos del blog, el resumen, el brief, el directorio de aeropuertos, las listas, la revisión de pedidos y los avisos de cambios. Los libros cuestan aparte.`),
    t("Without a pass, each item is sold on its own:", "Sin el pase, cada pieza se vende por separado:"),
    ...items.map((i) => `- ${i.title}: ${i.price}`),
    "",
    t("How to keep it under control:", "Cómo mantenerlo bajo control:"),
    ...limits.map((l) => `- ${l}`),
    "",
    t(`How to check what you got: every answer is signed. The public key is at ${origin}/api/agent/key and stays free, even after a pass ends.`,
      `Cómo comprobar lo que recibió: cada respuesta está firmada. La clave pública está en ${origin}/api/agent/key y es gratis, incluso cuando el pase termina.`),
    t("What Safehubby records: counts of what was asked, and the payment itself. It does not keep addresses or the text of private requests.",
      "Qué registra Safehubby: cuántas veces se pidió cada cosa, y el pago. No guarda direcciones ni el texto de pedidos privados."),
    t("What it does not do: it makes no promise about what your agent will get from it, and it does not do errands through this store.",
      "Lo que no hace: no promete lo que su agente obtendrá, y no hace mandados a través de esta tienda."),
    t(`Questions, or a payment problem: email ${CONTACT_EMAIL}. A person reads it.`, `Preguntas o un problema con un pago: escriba a ${CONTACT_EMAIL}. Lo lee una persona.`),
  ];
  return {
    lang, title: lines[0]!, limits, pass, items, catalog: `${origin}/api/agent/catalog`, key: `${origin}/api/agent/key`, contact: CONTACT_EMAIL,
    forPerson: lines.join("\n"),
  };
}
