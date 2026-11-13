import { describe, expect, it } from "vitest";
import { WHATSAPP_DISPLAY, WHATSAPP_NUMBER, whatsappLink } from "../src/index.ts";

describe("the WhatsApp line", () => {
  it("is the number in international form, digits only, as wa.me needs it", () => {
    expect(WHATSAPP_NUMBER).toMatch(/^1\d{10}$/);
    expect(WHATSAPP_DISPLAY.replace(/\D/g, "")).toBe(WHATSAPP_NUMBER);
  });

  it("opens a chat with a greeting in the visitor's language", () => {
    const es = new URL(whatsappLink("es"));
    expect(es.origin + es.pathname).toBe(`https://wa.me/${WHATSAPP_NUMBER}`);
    expect(es.searchParams.get("text")).toContain("Quiero saber más");
    expect(new URL(whatsappLink("en")).searchParams.get("text")).toContain("I'd like to know more");
  });
});
