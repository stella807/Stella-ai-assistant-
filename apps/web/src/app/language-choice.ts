import { languageOfSitePath, type SiteLang } from "@safehubby/core";

/**
 * Which language the app opens in.
 *
 * A Spanish address wins: somebody who followed a link to /es, or found the
 * Spanish page in a search, asked for Spanish. After that comes the choice
 * they made last time, then what their browser speaks. English addresses
 * decide nothing, so a returning Spanish reader is not flipped to English by
 * opening the home page.
 */
export function chooseLanguage(input: { pathname: string; stored: string | null; browser: string | undefined }): SiteLang {
  const fromPath = languageOfSitePath(input.pathname);
  if (fromPath) return fromPath;
  if (input.stored === "en" || input.stored === "es") return input.stored;
  return input.browser?.toLowerCase().startsWith("es") ? "es" : "en";
}
