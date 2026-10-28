/**
 * Times and dates in the reader's language, rather than whatever locale the
 * phone happens to be set to: a Spanish screen with an English date on it is
 * the mixed page this exists to prevent.
 */
export type Lang = "en" | "es";

export const localeOf = (lang: Lang) => (lang === "es" ? "es-PR" : "en-US");

export const timeOf = (iso: string | number | Date, lang: Lang) =>
  new Date(iso).toLocaleTimeString(localeOf(lang), { hour: "numeric", minute: "2-digit" });

export const dayOf = (iso: string | number | Date, lang: Lang, month: "short" | "long" = "short") =>
  new Date(iso).toLocaleDateString(localeOf(lang), { month, day: "numeric" });
