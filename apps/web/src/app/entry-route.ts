/**
 * Which screen a link opens the app on.
 *
 * Applying for a job needs no account, and the places that advertise the jobs
 * — the website's "See open roles" button, the hiring posts — should put a
 * person on the application, not on the landing page of an app built for
 * somebody else. A URL hash does it without a router: the app has none, and a
 * hash never reaches the server, so no deploy config changes with it.
 *
 * Only the two public applications are reachable this way. Everything else is
 * behind an account, and a link has no business choosing it.
 */
export type EntryRoute = "out" | "drive" | "work";

const HASHES: Record<Exclude<EntryRoute, "out">, string> = {
  work: "careers",
  drive: "drive",
};

export function entryRouteFromHash(hash: string): EntryRoute {
  // "#/careers?utm_source=x" — tolerate a slash and a query a link may carry.
  const key = hash.replace(/^#\/?/, "").split(/[?&]/)[0]!.toLowerCase();
  for (const [route, h] of Object.entries(HASHES)) if (h === key && hash.startsWith("#")) return route as EntryRoute;
  return "out";
}

/** The hash that reopens a route, or "" for none. */
export function hashForEntryRoute(route: string): string {
  return route === "work" || route === "drive" ? `#${HASHES[route]}` : "";
}

/**
 * The role a careers link asks to start on, if any — `#careers?role=errand-runner`.
 *
 * An ad for errand runners should open the form with Errand runner already
 * chosen, not with the first card of nine highlighted. Returned as a plain
 * string and checked by the form against the roles the server actually
 * offers, so a stale or invented value falls back to the default rather than
 * selecting something that is not there.
 */
export function entryRoleFromHash(hash: string): string | undefined {
  if (entryRouteFromHash(hash) !== "work") return undefined;
  const query = hash.split("?")[1] ?? "";
  const value = new URLSearchParams(query).get("role")?.trim().toLowerCase();
  return value && /^[a-z-]{1,40}$/.test(value) ? value : undefined;
}

/**
 * The same links as plain addresses. With the app on the site's own domain,
 * `safehubby.com/work` is what gets printed on a flyer or typed into a bio, so
 * it has to open the application — the server already answers every unknown
 * path with the app, this only teaches the app what to do with it.
 */
const PATHS: Record<string, Exclude<EntryRoute, "out">> = {
  "/work": "work",
  "/careers": "work",
  "/trabajo": "work",
  "/es/trabajo": "work",
  "/drive": "drive",
};

const entryPathKey = (pathname: string) => pathname.toLowerCase().replace(/\/+$/, "");

export function entryRouteFromUrl(loc: { pathname: string; hash: string }): EntryRoute {
  return PATHS[entryPathKey(loc.pathname)] ?? entryRouteFromHash(loc.hash);
}

export function entryRoleFromUrl(loc: { pathname: string; hash: string; search: string }): string | undefined {
  if (entryRouteFromUrl(loc) !== "work") return undefined;
  const fromHash = entryRoleFromHash(loc.hash);
  if (fromHash) return fromHash;
  const value = new URLSearchParams(loc.search).get("role")?.trim().toLowerCase();
  return value && /^[a-z-]{1,40}$/.test(value) ? value : undefined;
}

/** Once the form is closed, a plain-address link goes back to the home
 *  address, so a refresh does not reopen a form somebody already left. */
export function pathAfterLeaving(pathname: string): string {
  return entryPathKey(pathname) in PATHS ? "/" : pathname;
}
