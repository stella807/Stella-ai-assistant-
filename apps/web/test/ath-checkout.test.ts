import { describe, expect, it } from "vitest";
import { ATH_CONTAINER_ID, athCheckoutConfig, ecommerceIdFrom } from "../src/app/ath-checkout.ts";

const input = { publicToken: "tok", total: "25.00", metadata1: "Safehubby balance", metadata2: "bl_abc", lang: "es" as const };

describe("athCheckoutConfig", () => {
  it("carries what the server asked to be paid, and nothing the customer can edit", () => {
    const c = athCheckoutConfig(input);
    expect(c).toMatchObject({ env: "production", publicToken: "tok", total: 25, lang: "es", metadata2: "bl_abc" });
  });
  it("keeps metadata inside Evertec's 40-character limit", () => {
    const c = athCheckoutConfig({ ...input, metadata1: "x".repeat(80), metadata2: "y".repeat(80) });
    expect(c.metadata1).toHaveLength(40);
    expect(c.metadata2).toHaveLength(40);
  });
  it("lists the one thing being bought, so the ATH Móvil screen says what it is for", () => {
    const [item] = athCheckoutConfig(input).items;
    expect(item).toMatchObject({ name: "Safehubby balance", quantity: "1", price: "25.00" });
  });
  it("refuses a total Evertec would reject", () => {
    expect(() => athCheckoutConfig({ ...input, total: "0.50" })).toThrow();
    expect(() => athCheckoutConfig({ ...input, total: "1500.01" })).toThrow();
    expect(() => athCheckoutConfig({ ...input, total: "abc" })).toThrow();
  });
  it("has a place on the page to put the button", () => {
    expect(ATH_CONTAINER_ID).toBe("ATHMovil_Checkout_Button_payment");
  });
});

describe("ecommerceIdFrom", () => {
  it("reads the id out of a successful authorization", () => {
    expect(ecommerceIdFrom({ status: "success", data: { ecommerceId: "ec1", ecommerceStatus: "COMPLETED" } })).toBe("ec1");
  });
  it("returns nothing for a failure or something unexpected", () => {
    expect(ecommerceIdFrom({ status: "error", data: {} })).toBeNull();
    expect(ecommerceIdFrom({ status: "success", data: {} })).toBeNull();
    expect(ecommerceIdFrom(null)).toBeNull();
    expect(ecommerceIdFrom("nope")).toBeNull();
  });
});
