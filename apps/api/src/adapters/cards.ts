import { lithicEmbedSession, lithicEnvironment, lithicTaskCards } from "./lithic-cards.ts";

/**
 * Task cards: single-use, spend-capped virtual cards, issued by Lithic.
 *
 * The assistant needs to pay for what a task asks for without ever touching
 * the customer's payment method, so each task gets its own virtual card,
 * limited to exactly the task's spend limit and closed the moment the task
 * ends. Everything about issuing is in lithic-cards.ts; this module is the
 * name the rest of the server knows it by.
 */
export const taskCards = lithicTaskCards;

/** What the browser needs to show one card. */
export interface CardView {
  provider: "lithic";
  embedSession: string;
  environment: "sandbox" | "production";
}

/**
 * Lithic needs only the page's origin, which is the app's public address, to
 * open the card there. The number goes from Lithic to the assistant's browser
 * — never through this server.
 */
export async function cardViewFor(cardId: string): Promise<CardView> {
  const origin = publicOrigin();
  if (!origin) throw new Error("Set SAFEHUBBY_PUBLIC_URL to the app's https address so Lithic can show the card there.");
  return { provider: "lithic", embedSession: await lithicEmbedSession(cardId, origin), environment: lithicEnvironment() };
}

/** The app's https origin, for Lithic's embed (which refuses anything else). */
function publicOrigin(): string | null {
  try {
    const url = new URL(process.env.SAFEHUBBY_PUBLIC_URL ?? "");
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
