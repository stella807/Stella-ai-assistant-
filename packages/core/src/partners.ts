import { isValidNewsletterEmail } from "./newsletter.ts";

/**
 * A company asking to work with Safehubby: a charter operator, a venue, a
 * hotel. Sent from the "Become a partner" form on the website, kept, and
 * emailed to the owner.
 */
export interface PartnerInquiry {
  id: string;
  company: string;
  name: string;
  email: string;
  /** What the company does, in their words. */
  about: string;
  language: "en" | "es";
  receivedAt: string;
}

export type PartnerInquiryField = "company" | "name" | "email" | "about";

const LIMITS: Record<PartnerInquiryField, [min: number, max: number]> = {
  company: [2, 120], name: [2, 80], email: [3, 254], about: [10, 2000],
};

/** A form's raw fields, checked and tidied; on failure, the first field that needs fixing. */
export function readPartnerInquiry(input: unknown):
  | { ok: true; value: Pick<PartnerInquiry, PartnerInquiryField> }
  | { ok: false; field: PartnerInquiryField } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const text = (k: PartnerInquiryField) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const oneLine = (s: string) => s.trim().replace(/\s+/g, " ");
  const value = {
    company: oneLine(text("company")),
    name: oneLine(text("name")),
    email: text("email").trim().toLowerCase(),
    about: text("about").trim(),
  };
  for (const field of ["company", "name", "email", "about"] as const) {
    const [min, max] = LIMITS[field];
    if (value[field].length < min || value[field].length > max) return { ok: false, field };
  }
  if (!isValidNewsletterEmail(value.email)) return { ok: false, field: "email" };
  return { ok: true, value };
}
