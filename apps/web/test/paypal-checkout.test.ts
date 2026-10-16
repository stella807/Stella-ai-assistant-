import { describe, expect, it } from "vitest";
import { paypalSdkUrl, setupTokenFromApproval } from "../src/app/paypal-checkout.ts";

describe("paypalSdkUrl", () => {
  it("loads only PayPal's button, for the merchant's client id", () => {
    const url = new URL(paypalSdkUrl("abc123"));
    expect(url.origin + url.pathname).toBe("https://www.paypal.com/sdk/js");
    expect(url.searchParams.get("client-id")).toBe("abc123");
    expect(url.searchParams.get("components")).toBe("buttons");
  });
  it("cannot be bent into another address by an odd client id", () => {
    const url = new URL(paypalSdkUrl("a&b=c#d"));
    expect(url.hostname).toBe("www.paypal.com");
    expect(url.searchParams.get("client-id")).toBe("a&b=c#d");
    expect(url.searchParams.get("b")).toBeNull();
  });
});

describe("setupTokenFromApproval", () => {
  it("reads the setup token PayPal's button hands back once the customer approves", () => {
    expect(setupTokenFromApproval({ vaultSetupToken: "SETUP-1" })).toBe("SETUP-1");
  });
  it("returns nothing when there is no approval to read", () => {
    for (const v of [null, undefined, {}, { vaultSetupToken: "" }, { vaultSetupToken: 5 }, "x"]) {
      expect(setupTokenFromApproval(v), JSON.stringify(v)).toBeNull();
    }
  });
});
