import { declareDiscoveryExtension, type DeclareDiscoveryExtensionInput } from "@x402/extensions/bazaar";

/**
 * What x402 directories (PayAI's Bazaar and others that read the same field) learn from a request for payment: how to
 * call each product, with an example. A directory lists an endpoint only after a paid call whose client sent this back,
 * so it costs nothing to declare and no directory is told anything the catalog does not already say.
 */
type Param = { example?: string; about: string };

const LANG: Param = { example: "en", about: "Language of the answer: en or es" };

const PARAMS: Record<string, Record<string, Param>> = {
  facts: { q: { example: "How much is Premium per month?", about: "A question about Safehubby's plans, prices, the Wingman Club, secure transport or safety rules" } },
  blog: { lang: LANG },
  digest: {},
  brief: {},
  airports: {
    q: { example: "San Juan", about: "City, country, airport name or three-letter code" },
    country: { about: "Only airports in this country" },
    limit: { about: "How many airports, up to 100" },
  },
  checklists: { lang: LANG },
  books: {},
  currency: {},
  check: { request: { example: '{"task":"Pick up a prescription","needed_by":"today 17:00","spend_cap":"$15"}', about: "The request as JSON (task, needed_by, from, to, spend_cap, if_unavailable, proof_wanted, contact, private_details_shared), under 2,000 characters" } },
  alerts: { since: { about: "ISO time of the last answer you got (its asOf); leave out to get everything" }, lang: LANG },
  checked: {
    q: { example: "pharmacy open Condado", about: "A place, a thing or a question in Puerto Rico, in a few words" },
    limit: { about: "How many checks, up to 25" },
  },
  live: { q: { example: "SJU delays", about: "A few words: weather or storm warnings in Puerto Rico, an airport code with delays, power outage, or pharmacy near a town or hospital in Puerto Rico" } },
};

/** What goes in the address itself, for the products sold at one address per item. */
const PATH_PARAMS: Record<string, string> = {
  slug: "Which one: the free list at the product's own address without it gives every slug",
  sha256: "SHA-256 (64 hex characters) of the exact bytes of a signed answer you were sent",
};

/**
 * `pathname` is the address asked for. A product sold at one address per item (an article, a book, a hash) declares its
 * route template, so a directory lists it once (/api/agent/blog/:slug) and not once for every article anyone bought.
 */
export function discoveryFor(product: { id: string; path: string }, pathname = product.path): Record<string, unknown> | undefined {
  const params = PARAMS[product.id];
  if (!params) return undefined;
  const examples = Object.fromEntries(Object.entries(params).flatMap(([k, p]) => (p.example ? [[k, p.example]] : [])));
  const properties = Object.fromEntries(Object.entries(params).map(([k, p]) => [k, { type: "string", description: p.about }]));
  const template = product.path.replace(/\{(\w+)\}/g, ":$1");
  const asked = pathname.split("/");
  const pathParams = Object.fromEntries(template.split("/").flatMap((seg, i) => (seg.startsWith(":") ? [[seg.slice(1), asked[i] ?? ""]] : [])));
  const named = Object.keys(pathParams).length > 0;
  // The library leaves the method to a hook that reads it from a framework's request; this store answers only GET, so it
  // is stated here (the builder accepts it).
  const ext = declareDiscoveryExtension({
    method: "GET", input: examples, inputSchema: { properties },
    ...(named ? { pathParams, pathParamsSchema: { properties: Object.fromEntries(Object.keys(pathParams).map((k) => [k, { type: "string", description: PATH_PARAMS[k] ?? k }])) } } : {}),
  } as DeclareDiscoveryExtensionInput);
  return named ? { bazaar: { ...ext.bazaar, routeTemplate: template } } : ext;
}

/** The name, tags and icon a directory shows next to every endpoint of the store. */
export const serviceInfo = (origin: string) => ({
  serviceName: "Safehubby",
  tags: ["puerto-rico", "weather", "airport-delays", "travel", "concierge"],
  iconUrl: `${origin}/apple-touch-icon.png`,
});
