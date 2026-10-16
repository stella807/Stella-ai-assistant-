import { composeText, type TextAlertKind, type TextLanguage } from "./sms.ts";
import { isValidNewsletterEmail, normalizeEmail } from "./newsletter.ts";

/**
 * Email alerts: the same alerts as the texts, for people who would rather
 * have them in an inbox.
 *
 * Same rules as `sms.ts`. Nobody is emailed until they say they want to be,
 * turning it off takes effect immediately, and the message says only that
 * something happened — never a place, an amount, or what was bought — because
 * an inbox preview can be read over a shoulder as easily as a lock screen.
 * The wording is the text's own, so the two channels can never drift apart.
 */
export interface EmailContact {
  email: string;
  language: TextLanguage;
  consentedAt: string;
  optedOutAt?: string;
}

export function registerEmailContact(input: {
  email: string; consent: boolean; language: TextLanguage; now: Date;
}): EmailContact {
  if (!input.consent) throw new Error("Please agree to receive email alerts first.");
  if (!isValidNewsletterEmail(input.email)) throw new Error("That email address does not look right.");
  return {
    email: normalizeEmail(input.email),
    language: input.language === "es" ? "es" : "en",
    consentedAt: input.now.toISOString(),
  };
}

export function optOutEmail(contact: EmailContact, now: Date): EmailContact {
  return { ...contact, optedOutAt: now.toISOString() };
}

export function canEmail(contact: EmailContact | undefined): contact is EmailContact {
  return contact !== undefined && contact.optedOutAt === undefined;
}

export function composeEmail(
  kind: TextAlertKind, vars: { name?: string }, language: TextLanguage,
): { subject: string; body: string } {
  const body = composeText(kind, vars, language);
  const footer = language === "es"
    ? "Puedes desactivar estas alertas en la app, cuando quieras."
    : "You can turn these alerts off in the app at any time.";
  return {
    subject: language === "es" ? "Safehubby: tienes una alerta" : "Safehubby: you have an alert",
    body: `${body}\n\n${footer}`,
  };
}
