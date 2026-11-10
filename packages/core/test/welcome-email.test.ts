import { describe, expect, it } from "vitest";
import { welcomeEmail } from "../src/welcome-email.ts";

describe("welcomeEmail", () => {
  it("greets by first name in English and Spanish", () => {
    const m = welcomeEmail({ name: "Luis Pagan", siteUrl: "https://safehubby.com" });
    expect(m.subject).toContain("Welcome to Safehubby");
    expect(m.body).toContain("Hi Luis,");
    expect(m.body).toContain("Hola Luis:");
    expect(m.body).toContain("https://safehubby.com");
  });

  it("leaves out a link that is not https and never repeats private details", () => {
    const m = welcomeEmail({ name: "", siteUrl: "http://evil.example" });
    expect(m.body).not.toContain("evil.example");
    expect(m.body).toContain("Hi there,");
    expect(m.body).not.toMatch(/\$\d/);
  });
});
