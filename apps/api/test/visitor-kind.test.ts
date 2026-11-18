import { describe, expect, it } from "vitest";
import { PageRateTracker, classifyVisitor, verifySearchEngine, type Dns } from "../src/visitor-kind.ts";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const OLD_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1";
const real = { "accept-language": "es-PR,es;q=0.9", "sec-fetch-mode": "navigate" };

describe("who is asked to pay beyond the named AI crawlers", () => {
  it("catches scripts and headless browsers that do not hide it", () => {
    for (const ua of ["python-requests/2.31.0", "Go-http-client/1.1", "axios/1.6.0", "node-fetch/1.0", "Scrapy/2.11", "okhttp/4.12.0", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36", "aiohttp/3.9", "python-httpx/0.27"]) {
      expect(classifyVisitor(ua, {}), ua).toBe("automation");
    }
  });

  it("catches a browser name with none of the headers every real browser sends", () => {
    expect(classifyVisitor(CHROME, {})).toBe("browser-lookalike");
    expect(classifyVisitor(CHROME, { accept: "text/html" })).toBe("browser-lookalike");
  });

  it("never catches a real person: a modern browser, an old phone, a privacy browser", () => {
    expect(classifyVisitor(CHROME, real)).toBe("normal");
    // An old iPhone does not send the Sec-Fetch headers at all, but it always sends a language.
    expect(classifyVisitor(OLD_SAFARI, { "accept-language": "es-PR" })).toBe("normal");
    // A privacy setup that strips the Sec-Fetch headers still sends a language.
    expect(classifyVisitor(CHROME, { "accept-language": "en-US,en;q=0.5" })).toBe("normal");
  });

  it("leaves alone the tools and bots that do not claim to be a browser, so health checks and link previews keep working", () => {
    for (const ua of ["curl/8.4.0", "UptimeRobot/2.0", "WhatsApp/2.23.20.0", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "Twitterbot/1.0", "TelegramBot (like TwitterBot)", "node", ""]) {
      expect(classifyVisitor(ua, {}), ua).toBe("normal");
    }
  });

  it("names the AI crawlers, and flags a visitor that says it is a search engine, for checking", () => {
    expect(classifyVisitor("Mozilla/5.0 (compatible; GPTBot/1.2)", {})).toBe("ai");
    expect(classifyVisitor("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", {})).toBe("search-claim");
    expect(classifyVisitor("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", {})).toBe("search-claim");
  });
});

describe("checking that a claimed search engine is the real one", () => {
  const dns = (map: Record<string, string>, forward: Record<string, string[]>): Dns => ({
    reverse: async (ip) => { if (!map[ip]) throw Object.assign(new Error("no name"), { code: "ENOTFOUND" }); return [map[ip]!]; },
    lookup: async (host) => forward[host] ?? [],
  });
  const google = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  it("accepts an address whose name ends in googlebot.com and points back to it", async () => {
    const d = dns({ "66.249.66.1": "crawl-66-249-66-1.googlebot.com" }, { "crawl-66-249-66-1.googlebot.com": ["66.249.66.1"] });
    expect(await verifySearchEngine("66.249.66.1", google, d)).toBe("real");
  });
  it("refuses a forged claim: wrong name, a name that does not point back, or no name at all", async () => {
    expect(await verifySearchEngine("1.2.3.4", google, dns({ "1.2.3.4": "host.example.com" }, {}))).toBe("fake");
    expect(await verifySearchEngine("1.2.3.4", google, dns({ "1.2.3.4": "evil.googlebot.com.attacker.net" }, { "evil.googlebot.com.attacker.net": ["1.2.3.4"] }))).toBe("fake");
    expect(await verifySearchEngine("1.2.3.4", google, dns({ "1.2.3.4": "a.googlebot.com" }, { "a.googlebot.com": ["9.9.9.9"] }))).toBe("fake");
    expect(await verifySearchEngine("1.2.3.4", google, dns({}, {}))).toBe("fake");
  });
  it("lets a search engine through when the check itself breaks, so a DNS outage never hurts the site's ranking", async () => {
    const broken: Dns = { reverse: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" }); }, lookup: async () => [] };
    expect(await verifySearchEngine("5.6.7.8", google, broken)).toBe("real");
  });
  it("checks Bing's names too", async () => {
    const d = dns({ "40.77.167.1": "msnbot-40-77-167-1.search.msn.com" }, { "msnbot-40-77-167-1.search.msn.com": ["40.77.167.1"] });
    expect(await verifySearchEngine("40.77.167.1", "Mozilla/5.0 (compatible; bingbot/2.0)", d)).toBe("real");
  });
});

describe("reading too many pages too fast", () => {
  it("flags one address that fetches many pages in a few minutes, and forgets it after the window", () => {
    const t = new PageRateTracker(5, 10);
    const start = new Date("2026-11-18T12:00:00Z");
    for (let i = 0; i < 5; i++) expect(t.hit("1.1.1.1", start)).toBe(false);
    expect(t.hit("1.1.1.1", start)).toBe(true);
    expect(t.hit("2.2.2.2", start)).toBe(false);
    expect(t.hit("1.1.1.1", new Date("2026-11-18T12:11:00Z"))).toBe(false);
  });
});
