import { describe, expect, it } from "vitest";
import { isAiAgent, isGatedPath, makePass, passIsValid } from "../src/site-pass.ts";
import { passLength } from "../src/site-pass-info.ts";

describe("which visitors are AI crawlers and agents", () => {
  it("recognises the named AI crawlers and assistants", () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "ChatGPT-User/1.0", "PerplexityBot/1.0", "CCBot/2.0 (https://commoncrawl.org/faq/)",
      "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", "meta-externalagent/1.1",
    ]) expect(isAiAgent(ua), ua).toBe(true);
  });
  it("never treats search engines, browsers, tools or a missing name as an AI crawler", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
      "curl/8.4.0", "UptimeRobot/2.0", "Applebot/0.1", "DuckDuckBot/1.1", "",
    ]) expect(isAiAgent(ua), ua).toBe(false);
    expect(isAiAgent(undefined)).toBe(false);
  });
});

describe("which addresses the site pass covers", () => {
  it("covers the website's pages", () => {
    for (const p of ["/", "/es", "/careers", "/es/trabajo", "/careers/some-job", "/drive", "/services/airport"]) expect(isGatedPath(p), p).toBe(true);
  });
  it("never covers the blog, the store, the API, search files, scripts or images", () => {
    for (const p of ["/blog", "/blog/x402-pay-per-request-explained", "/es/blog", "/es/blog/guia-servicio-vip-aeropuerto", "/api/health", "/api/agent/catalog", "/api/ask",
      "/robots.txt", "/sitemap.xml", "/llms.txt", "/widget.js", "/assets/index-abc.js", "/favicon.ico", "/photo.jpg", "/openreceive/x"]) expect(isGatedPath(p), p).toBe(false);
  });
});

describe("the visit pass", () => {
  const secret = "s3cret-for-tests";
  const now = new Date("2026-11-18T12:00:00Z");
  it("is accepted for the payer it was made for until it ends", () => {
    const pass = makePass(secret, "0xAbC", now, 60);
    expect(passIsValid(secret, pass, now)).toBe(true);
    expect(passIsValid(secret, pass, new Date("2026-11-18T12:59:00Z"))).toBe(true);
    expect(passIsValid(secret, pass, new Date("2026-11-18T13:00:01Z"))).toBe(false);
  });
  it("is refused when changed, made with another secret, or garbled", () => {
    const pass = makePass(secret, "0xabc", now, 60);
    const [payer, exp, sig] = pass.split(".") as [string, string, string];
    expect(passIsValid(secret, `${payer}.${Number(exp) + 1}.${sig}`, now)).toBe(false);
    expect(passIsValid(secret, `0xother.${exp}.${sig}`, now)).toBe(false);
    expect(passIsValid("another-secret", pass, now)).toBe(false);
    for (const junk of ["", "x", "a.b", "a.b.c", "..", `${payer}.abc.${sig}`]) expect(passIsValid(secret, junk, now)).toBe(false);
  });
});

describe("how long a visit is said to last", () => {
  it("says minutes, hours or days, whichever a person would say, never a big number of minutes", () => {
    expect(passLength(1)).toBe("1 minute");
    expect(passLength(60)).toBe("60 minutes");
    expect(passLength(180)).toBe("3 hours");
    expect(passLength(1440)).toBe("24 hours");
    expect(passLength(2880)).toBe("2 days");
    expect(passLength(43200)).toBe("30 days");
    expect(passLength(10080)).toBe("7 days");
  });
});
