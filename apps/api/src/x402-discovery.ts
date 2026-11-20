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

export function discoveryFor(productId: string): Record<string, unknown> | undefined {
  const params = PARAMS[productId];
  if (!params) return undefined;
  const examples = Object.fromEntries(Object.entries(params).flatMap(([k, p]) => (p.example ? [[k, p.example]] : [])));
  const properties = Object.fromEntries(Object.entries(params).map(([k, p]) => [k, { type: "string", description: p.about }]));
  // The library leaves the method to a hook that reads it from a framework's request; this store answers only GET, so it
  // is stated here (the builder accepts it).
  return declareDiscoveryExtension({ method: "GET", input: examples, inputSchema: { properties } } as DeclareDiscoveryExtensionInput);
}

/** The name, tags and icon a directory shows next to every endpoint of the store. */
export const serviceInfo = (origin: string) => ({
  serviceName: "Safehubby",
  tags: ["puerto-rico", "weather", "airport-delays", "travel", "concierge"],
  iconUrl: `${origin}/apple-touch-icon.png`,
});
