/**
 * What a request costs, sent by email rather than spelled out on screen.
 *
 * The app keeps the screen to the request itself; the numbers go to the
 * customer's inbox twice — what is held when it is booked, and what was
 * actually charged when it is done — so there is always a written record
 * of both.
 */
export interface CostEmailInput {
  stage: "held" | "charged";
  categoryLabel: string;
  serviceFeeCents: number;
  /** The spending limit when held; what was actually spent when charged. */
  purchaseCents: number;
  assistantName?: string;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function costEmail(input: CostEmailInput, language: "en" | "es"): { subject: string; body: string } {
  const total = input.serviceFeeCents + input.purchaseCents;
  const who = input.assistantName ?? (language === "es" ? "tu asistente" : "your assistant");
  if (language === "es") {
    return input.stage === "held"
      ? {
        subject: `Safehubby: ${input.categoryLabel} — lo que se retiene`,
        body: `Tu solicitud está en camino con ${who}.\n\nTiempo del asistente: ${usd(input.serviceFeeCents)}\nLímite para compras: ${usd(input.purchaseCents)}\nRetenido ahora: ${usd(total)}\n\nSolo se cobra lo que de verdad se gaste, nunca más del límite. Recibirás otro correo con el total final.`,
      }
      : {
        subject: `Safehubby: ${input.categoryLabel} — lo que se cobró`,
        body: `Tu solicitud está completa.\n\nTiempo del asistente: ${usd(input.serviceFeeCents)}\nCompras: ${usd(input.purchaseCents)}\nTotal cobrado: ${usd(total)}\n\nEl resto de lo retenido se libera en tu tarjeta.`,
      };
  }
  return input.stage === "held"
    ? {
      subject: `Safehubby: ${input.categoryLabel} — what is held`,
      body: `Your request is on its way with ${who}.\n\nAssistant's time: ${usd(input.serviceFeeCents)}\nSpending limit for purchases: ${usd(input.purchaseCents)}\nHeld now: ${usd(total)}\n\nYou are only charged for what is actually spent, never more than the limit. You will get another email with the final total.`,
    }
    : {
      subject: `Safehubby: ${input.categoryLabel} — what you were charged`,
      body: `Your request is done.\n\nAssistant's time: ${usd(input.serviceFeeCents)}\nPurchases: ${usd(input.purchaseCents)}\nTotal charged: ${usd(total)}\n\nAnything else that was held is released back to your card.`,
    };
}
