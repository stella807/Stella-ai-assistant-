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
  spend: {
    rule: { example: '{"max_per_request_usd":0.25,"max_per_day_usd":2,"allowed":["live answers"]}', about: "Your person's spending rule as JSON: max_per_request_usd, max_per_day_usd, allowed[], retry_if_source_down, ask_first_for[]" },
    purchase: { example: '{"item":"live answers","price_usd":0.25,"spent_today_usd":1,"seen_before":true}', about: "The purchase you are about to make as JSON: item, price_usd, spent_today_usd, seen_before, retry {count, because}" },
  },
  alerts: { since: { about: "ISO time of the last answer you got (its asOf); leave out to get everything" }, lang: LANG },
  checked: {
    q: { example: "pharmacy open Condado", about: "A place, a thing or a question in Puerto Rico, in a few words" },
    limit: { about: "How many checks, up to 25" },
  },
  live: { q: { example: "SJU delays", about: "A few words: weather or storm warnings in Puerto Rico or in a named US city, an airport code with delays, power outage in Puerto Rico, pharmacy near a town, city or hospital in Puerto Rico or the US, earthquakes, waves or tide at San Juan, river levels in Puerto Rico, a travel advisory for a country, or CDC travel health notices" } },
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

/** A product as the discovery files show it: its price now, and an address a probe can ask for when the path names an item. */
export interface Listed {
  id: string; title: string; description: string; path: string; usage: string;
  price: string;
  /** Set when some requests cost less than `price` (power alone, a cheaper book). */
  minPrice?: string;
  /** A real address for a path with a name in it (an article that exists), so a directory's probe gets a 402 and not a 404. */
  example?: string;
  /** Sold only after a site pass: a probe would be asked for the pass, so it is described but not offered to probes. */
  requiresPass?: boolean;
}

const dollars = (price: string) => price.replace(/^\$/, "").trim();

/** /.well-known/x402: the addresses a directory such as x402scan probes and lists. */
export function wellKnownX402(origin: string, items: Listed[]): { version: 1; resources: string[] } {
  const resources = items.flatMap((p) => {
    if (p.requiresPass) return [];
    if (!p.path.includes("{")) return [`${origin}${p.path}`];
    return p.example ? [`${origin}${p.example}`] : [];
  });
  return { version: 1, resources };
}

/** /openapi.json: every endpoint, the paid ones with their x402 price in dollars, the free ones without. */
export function openApiDoc(origin: string, items: Listed[], opts: { freeSample?: boolean } = {}): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const free = (summary: string, description: string) => ({ get: { summary, description, responses: { 200: { description: "JSON", content: { "application/json": {} } } } } });
  paths["/api/agent/catalog"] = free("Catalog (free)", "Everything for sale, with prices, what each answer includes and leaves out, and how to ask.");
  paths["/api/agent/key"] = free("Signing key (free)", "The ed25519 public key that signs every paid answer, so an answer can be checked without trusting anything else.");
  if (opts.freeSample) paths["/api/agent/sample"] = {
    get: {
      ...free("One free live answer a day", "Ask your own question once a day free, signed like a paid answer, to see what live answers give before paying. A question with no answer does not use it up. 429 with the paid address once it is used.").get,
      parameters: [{ in: "query", name: "q", required: true, description: PARAMS.live!.q!.about, schema: { type: "string" }, example: "SJU delays" }],
    },
  };
  paths["/api/agent/approval"] = free("Approval page (free)", "Plain text for the person an agent works for: the prices, how to cap spending, how to check an answer, how to reach a person. Add ?lang=es for Spanish.");
  for (const p of items) {
    const params = PARAMS[p.id] ?? {};
    const pathNames = [...p.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
    const price = p.minPrice && p.minPrice !== p.price
      ? { mode: "dynamic", currency: "USD", min: dollars(p.minPrice), max: dollars(p.price) }
      : { mode: "fixed", currency: "USD", amount: dollars(p.price) };
    paths[p.path] = {
      get: {
        operationId: p.id,
        summary: p.title,
        description: `${p.description} Usage: ${p.usage}`,
        parameters: [
          ...pathNames.map((name) => ({ in: "path", name, required: true, description: PATH_PARAMS[name] ?? name, schema: { type: "string" } })),
          ...Object.entries(params).map(([name, q]) => ({ in: "query", name, required: false, description: q.about, schema: { type: "string" }, ...(q.example ? { example: q.example } : {}) })),
        ],
        "x-payment-info": { protocols: ["x402"], price },
        responses: {
          200: { description: "The answer, signed (ed25519, see /api/agent/key)", content: { [p.id === "books" ? "application/pdf" : "application/json"]: {} } },
          402: { description: "Payment required: x402 v2, USDC on Base. The request for payment is in the PAYMENT-REQUIRED header and the body." },
          404: { description: "No answer: the request could not be read, is not covered, or its source is down. Nothing is charged. A search that is made and finds nothing answers 200 with found: false and is charged." },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Safehubby agent store",
      version: "1",
      description: "Answers for AI agents about Puerto Rico and travel, paid per answer with x402 (USDC on Base): live weather, storm, airport-delay, power-outage and pharmacy answers from official public sources, dated checks made on the ground, and tools for handing a task to a person. Nothing is guessed: with no answer (source down, not covered), nothing is charged; a search that finds nothing is charged and says so.",
      contact: { email: "contact@safehubby.com", url: origin },
    },
    servers: [{ url: origin }],
    paths,
  };
}

/** /llms.txt: the same, in plain words, for a model reading the site. */
export function llmsTxt(origin: string, items: Listed[], opts: { freeSample?: boolean } = {}): string {
  const price = (p: Listed) => (p.minPrice && p.minPrice !== p.price ? `${p.minPrice} to ${p.price}` : p.price);
  return [
    "# Safehubby",
    "",
    "> Concierge, personal assistants, errands and rides in Puerto Rico, run by a person. AI agents can buy answers here, paid per answer with x402 (USDC on Base). With no answer (a source down, a question not covered), nothing is charged; a search that finds nothing is charged and says so.",
    "",
    "## Agent store",
    "",
    ...items.map((p) => `- [${p.title}](${origin}${p.path}): ${price(p)} per answer. ${p.usage}`),
    "",
    "## How to start",
    "",
    `- [Catalog, free](${origin}/api/agent/catalog): every product, price, what is included and what is not.`,
    ...(opts.freeSample ? [`- [One free live answer a day](${origin}/api/agent/sample?q=SJU%20delays): try your own question before paying.`] : []),
    `- [OpenAPI](${origin}/openapi.json) and [x402 discovery](${origin}/.well-known/x402): the same, for software.`,
    `- [Approval page, free](${origin}/api/agent/approval): plain text for the person you work for.`,
    `- [Signing key, free](${origin}/api/agent/key): check that a paid answer came from Safehubby.`,
    `- [Blog](${origin}/blog): free articles for people.`,
    "",
    "Questions: contact@safehubby.com",
    "",
  ].join("\n");
}
