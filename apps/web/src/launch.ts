import type { LaunchStatus } from "./api.ts";
import type { Language, TranslationKey } from "./i18n.tsx";

/**
 * The launch-party sentence, composed in the reader's language.
 *
 * The API sends a ready-made `note`, and it is deliberately not what gets
 * rendered here: it can only ever be in one language, and a Spanish visitor
 * reading a Spanish heading above an English sentence is worse than either
 * language on its own. So the API's structured fields (`phase`, `startsAt`,
 * `discountRate`) are the contract, and the wording is assembled on the
 * client where the active language is known. The server's `note` stays for
 * consumers that have no dictionary — the docs, and anything that is not this
 * web app.
 *
 * Shared by the landing banner and the share sheet rather than written twice,
 * so the promotion cannot end up described two different ways in one app.
 */
export function launchNote(
  launch: LaunchStatus,
  t: (key: TranslationKey) => string,
  language: Language,
): string {
  const pct = `${Math.round(launch.discountRate * 100)}%`;
  const on = (iso: string) =>
    new Date(iso).toLocaleDateString(language === "es" ? "es-ES" : "en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

  if (launch.phase === "open") {
    return t("launch.noteOpen").replace("{date}", on(launch.endsAt)).replace("{pct}", pct);
  }
  if (launch.phase === "upcoming") {
    return t("launch.noteUpcoming").replace("{date}", on(launch.startsAt)).replace("{pct}", pct);
  }
  return t("launch.noteClosed");
}
