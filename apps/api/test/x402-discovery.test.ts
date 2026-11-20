import { describe, expect, it } from "vitest";
import { extractDiscoveryInfo, isValidIconUrl, isValidServiceName, sanitizeTags, validateDiscoveryExtension } from "@x402/extensions/bazaar";
import { discoveryFor, llmsTxt, openApiDoc, serviceInfo, wellKnownX402 } from "../src/x402-discovery.ts";
import { listing, PRODUCTS } from "../src/x402-sales.ts";

describe("what the x402 directories read from a request for payment", () => {
  it("describes every paid product as a GET with an example question, and every example names a field the schema explains", () => {
    for (const p of PRODUCTS) {
      const d: any = discoveryFor(p)?.bazaar;
      expect(d, p.id).toBeTruthy();
      expect(d.info.input).toMatchObject({ type: "http", method: "GET" });
      expect(validateDiscoveryExtension(d), p.id).toMatchObject({ valid: true });
      const props = d.schema.properties.input.properties.queryParams?.properties ?? {};
      for (const k of Object.keys(d.info.input.queryParams ?? {})) expect(props[k]?.description, `${p.id}.${k}`).toBeTruthy();
    }
    expect(discoveryFor({ id: "nothing-by-that-name", path: "/x" })).toBeUndefined();
  });

  it("gives the live answers an airport and a weather example, so an agent can see what to ask", () => {
    const d: any = discoveryFor(PRODUCTS.find((p) => p.id === "live")!)!.bazaar;
    expect(d.info.input.queryParams.q).toMatch(/SJU/);
    expect(d.schema.properties.input.properties.queryParams.properties.q.description).toMatch(/weather/i);
  });

  it("names the service with short tags and an icon on the site, and gives no phone number or personal address", () => {
    const s = serviceInfo("https://safehubby.com");
    expect(s.serviceName).toBe("Safehubby");
    expect(s.tags.length).toBeLessThanOrEqual(5);
    for (const t of s.tags) expect(t.length).toBeLessThanOrEqual(32);
    expect(s.iconUrl).toBe("https://safehubby.com/apple-touch-icon.png");
    // The same checks a facilitator runs before it lists anything.
    expect(isValidServiceName(s.serviceName) && isValidIconUrl(s.iconUrl)).toBe(true);
    expect(sanitizeTags(s.tags)).toEqual(s.tags);
    const all = JSON.stringify([s, ...PRODUCTS.map((p) => discoveryFor(p))]);
    expect(all).not.toMatch(/\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b|@(?!safehubby\.com)[a-z0-9-]+\.[a-z]/i);
  });

  it("lists a page with a name in its address (an article, a book, a hash) once for all of them, the way a directory reads it", () => {
    const currency = PRODUCTS.find((p) => p.id === "currency")!;
    const hash = "a".repeat(64);
    const ext: any = discoveryFor(currency, `/api/agent/currency/${hash}`);
    expect(ext.bazaar.routeTemplate).toBe("/api/agent/currency/:sha256");
    expect(ext.bazaar.info.input.pathParams).toEqual({ sha256: hash });
    expect(validateDiscoveryExtension(ext.bazaar)).toMatchObject({ valid: true });
    // What a facilitator keeps after a paid call whose client sent the field back.
    const resource = { url: `https://safehubby.com/api/agent/currency/${hash}`, description: "x", mimeType: "application/json", ...serviceInfo("https://safehubby.com") };
    const kept: any = extractDiscoveryInfo({ x402Version: 2, resource, accepted: {}, payload: {}, extensions: ext } as any, {} as any);
    expect(kept).toMatchObject({ resourceUrl: "https://safehubby.com/api/agent/currency/:sha256", serviceName: "Safehubby", method: "GET", tags: serviceInfo("x").tags });
    const blog: any = discoveryFor(PRODUCTS.find((p) => p.id === "blog")!, "/api/agent/blog/visiting-puerto-rico");
    expect(blog.bazaar).toMatchObject({ routeTemplate: "/api/agent/blog/:slug", info: { input: { pathParams: { slug: "visiting-puerto-rico" } } } });
    expect((discoveryFor(PRODUCTS.find((p) => p.id === "live")!) as any).bazaar.routeTemplate).toBeUndefined();
  });
});

describe("the files a directory reads from the site to find every paid endpoint", () => {
  const origin = "https://safehubby.com";
  const items = listing();

  it("lists in /.well-known/x402 one plain address per product a probe can ask for, without a query or a placeholder", () => {
    const doc = wellKnownX402(origin, items);
    expect(doc.version).toBe(1);
    expect(doc.resources).toContain("https://safehubby.com/api/agent/live");
    expect(doc.resources).toContain("https://safehubby.com/api/agent/checked");
    expect(doc.resources.some((r) => r.startsWith("https://safehubby.com/api/agent/blog/"))).toBe(true);
    for (const r of doc.resources) expect(r).not.toMatch(/[{}?]/);
    // A book is sold only after a site pass, so a probe would be asked for the pass, not the book.
    expect(doc.resources.some((r) => r.includes("/books/"))).toBe(false);
  });

  it("describes every paid product in /openapi.json with its price in dollars, the 402, and what to send", () => {
    const doc: any = openApiDoc(origin, items);
    expect(doc).toMatchObject({ openapi: "3.1.0", info: { title: expect.any(String), version: expect.any(String) }, servers: [{ url: origin }] });
    for (const p of PRODUCTS) {
      const op = doc.paths[p.path].get;
      expect(op["x-payment-info"].protocols, p.id).toEqual(["x402"]);
      expect(op.responses["402"], p.id).toBeTruthy();
      for (const name of p.path.match(/\{(\w+)\}/g) ?? []) expect(op.parameters).toContainEqual(expect.objectContaining({ in: "path", name: name.slice(1, -1), required: true }));
    }
    expect(doc.paths["/api/agent/facts"].get["x-payment-info"].price).toEqual({ mode: "fixed", currency: "USD", amount: "0.01" });
    expect(doc.paths["/api/agent/live"].get["x-payment-info"].price).toEqual({ mode: "dynamic", currency: "USD", min: "0.10", max: "0.25" });
    expect(doc.paths["/api/agent/live"].get.parameters).toContainEqual(expect.objectContaining({ in: "query", name: "q", description: expect.stringMatching(/weather/i) }));
    expect(doc.paths["/api/agent/catalog"].get["x-payment-info"]).toBeUndefined();
  });

  it("says in /llms.txt what an agent can buy, for how much, and where to write, with no phone number", () => {
    const t = llmsTxt(origin, items);
    expect(t).toMatch(/^# Safehubby/);
    expect(t).toContain("https://safehubby.com/api/agent/live");
    expect(t).toContain("$0.25");
    expect(t).toContain("https://safehubby.com/openapi.json");
    expect(t).toContain("contact@safehubby.com");
    expect(t).not.toMatch(/\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b|whatsapp/i);
  });
});
