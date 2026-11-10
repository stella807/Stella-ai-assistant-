import { STAFF_ROLES, type StaffRole } from "./staffing.ts";

/**
 * The public addresses of the site, in one table.
 *
 * Two things read it. The server, to tell a search engine what each address
 * is: its language, its one canonical address, and its twin in the other
 * language. And the app, to open the right screen in the right language from
 * a plain address. Keeping them in one place is the point: an address the
 * sitemap advertises that the app does not answer is a broken result.
 *
 * English lives at the root and Spanish under /es. A Spanish address always
 * means Spanish; an English address leaves a returning visitor's own choice
 * alone.
 */
export type SiteLang = "en" | "es";
export const SITE_LANGS: SiteLang[] = ["en", "es"];

/** home: the landing page. careers: every open job. job: one job. drive: the driver application. */
export type SitePage = "home" | "careers" | "job" | "drive";

export interface SiteRoute {
  page: SitePage;
  lang: SiteLang;
  /** The one address to index for this page. An alias such as /work resolves to it. */
  path: string;
  /** The job a `job` page is for. */
  role?: StaffRole;
}

const HOME: Record<SiteLang, string> = { en: "/", es: "/es" };
const CAREERS: Record<SiteLang, string> = { en: "/careers", es: "/es/trabajo" };
const DRIVE: Record<SiteLang, string> = { en: "/drive", es: "/es/chofer" };

/** Older and printed addresses that still have to open the right page. */
const ALIASES: Record<string, string> = { "/work": "/careers", "/trabajo": "/es/trabajo" };

/** Signed-in areas: served, never indexed. */
export const PRIVATE_SITE_PATHS = ["/master", "/employee"];

/** Drivers apply on their own form, so they have no page under careers. */
const JOB_ROLES = STAFF_ROLES.filter((r) => r.id !== "driver").map((r) => r.id);

/** Lower case, no trailing slash; the root stays "/". */
export function normalizeSitePath(pathname: string): string {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

export function sitePathFor(page: SitePage, lang: SiteLang, role?: StaffRole): string {
  if (page === "home") return HOME[lang];
  if (page === "drive") return DRIVE[lang];
  if (page === "job" && role) return `${CAREERS[lang]}/${role}`;
  return CAREERS[lang];
}

/** The page an address is, or null for one the site does not have. */
export function siteRouteFor(pathname: string): SiteRoute | null {
  const normal = normalizeSitePath(pathname);
  const path = ALIASES[normal] ?? normal;
  for (const lang of SITE_LANGS) {
    if (path === HOME[lang]) return { page: "home", lang, path };
    if (path === CAREERS[lang]) return { page: "careers", lang, path };
    if (path === DRIVE[lang]) return { page: "drive", lang, path };
    if (path.startsWith(`${CAREERS[lang]}/`)) {
      const role = path.slice(CAREERS[lang].length + 1);
      const known = JOB_ROLES.find((id) => id === role);
      if (known) return { page: "job", lang, path, role: known };
    }
  }
  return null;
}

export function isPrivateSitePath(pathname: string): boolean {
  return PRIVATE_SITE_PATHS.includes(normalizeSitePath(pathname));
}

/** The same page in another language. */
export function alternateSiteRoute(route: SiteRoute, lang: SiteLang): SiteRoute {
  return { ...route, lang, path: sitePathFor(route.page, lang, route.role) };
}

/** The language an address insists on. Only Spanish addresses insist. */
export function languageOfSitePath(pathname: string): SiteLang | null {
  return siteRouteFor(pathname)?.lang === "es" ? "es" : null;
}

/** Where the address bar should point after the language is switched, or null to leave it alone. */
export function sitePathInLanguage(pathname: string, lang: SiteLang): string | null {
  const route = siteRouteFor(pathname);
  if (!route) return null;
  const next = alternateSiteRoute(route, lang).path;
  return next === normalizeSitePath(pathname) ? null : next;
}

/** Every address worth indexing: both languages of each page, and one page per job that is open. */
export function indexableSiteRoutes(openRoles: readonly StaffRole[]): SiteRoute[] {
  const routes: SiteRoute[] = [];
  for (const page of ["home", "careers", "drive"] as const) {
    for (const lang of SITE_LANGS) routes.push({ page, lang, path: sitePathFor(page, lang) });
  }
  for (const role of JOB_ROLES.filter((id) => openRoles.includes(id))) {
    for (const lang of SITE_LANGS) routes.push({ page: "job", lang, path: sitePathFor("job", lang, role), role });
  }
  return routes;
}
