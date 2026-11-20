import { describe, expect, it } from "vitest";
import { isValidIconUrl, isValidServiceName, sanitizeTags, validateDiscoveryExtension } from "@x402/extensions/bazaar";
import { discoveryFor, serviceInfo } from "../src/x402-discovery.ts";
import { PRODUCTS } from "../src/x402-sales.ts";

describe("what the x402 directories read from a request for payment", () => {
  it("describes every paid product as a GET with an example question, and every example names a field the schema explains", () => {
    for (const p of PRODUCTS) {
      const d: any = discoveryFor(p.id)?.bazaar;
      expect(d, p.id).toBeTruthy();
      expect(d.info.input).toMatchObject({ type: "http", method: "GET" });
      expect(validateDiscoveryExtension(d), p.id).toMatchObject({ valid: true });
      const props = d.schema.properties.input.properties.queryParams?.properties ?? {};
      for (const k of Object.keys(d.info.input.queryParams ?? {})) expect(props[k]?.description, `${p.id}.${k}`).toBeTruthy();
    }
    expect(discoveryFor("nothing-by-that-name")).toBeUndefined();
  });

  it("gives the live answers an airport and a weather example, so an agent can see what to ask", () => {
    const d: any = discoveryFor("live")!.bazaar;
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
    const all = JSON.stringify([s, ...PRODUCTS.map((p) => discoveryFor(p.id))]);
    expect(all).not.toMatch(/\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b|@(?!safehubby\.com)[a-z0-9-]+\.[a-z]/i);
  });
});
