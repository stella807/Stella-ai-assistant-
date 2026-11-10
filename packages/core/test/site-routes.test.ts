import { describe, expect, it } from "vitest";
import {
  alternateSiteRoute, indexableSiteRoutes, isPrivateSitePath, languageOfSitePath, normalizeSitePath,
  siteRouteFor, sitePathFor, sitePathInLanguage,
} from "../src/site-routes.ts";

describe("the site's public addresses", () => {
  it("knows the home page in both languages", () => {
    expect(siteRouteFor("/")).toEqual({ page: "home", lang: "en", path: "/" });
    expect(siteRouteFor("/es")).toEqual({ page: "home", lang: "es", path: "/es" });
    expect(siteRouteFor("/ES/")).toEqual({ page: "home", lang: "es", path: "/es" });
  });

  it("resolves the printed aliases to the one address to index", () => {
    expect(siteRouteFor("/work")?.path).toBe("/careers");
    expect(siteRouteFor("/trabajo")).toEqual({ page: "careers", lang: "es", path: "/es/trabajo" });
    expect(siteRouteFor("/careers/")?.page).toBe("careers");
  });

  it("gives each job its own page, but never an invented one", () => {
    expect(siteRouteFor("/careers/personal-assistant")).toEqual({
      page: "job", lang: "en", path: "/careers/personal-assistant", role: "personal-assistant",
    });
    expect(siteRouteFor("/es/trabajo/bodyguard")?.role).toBe("bodyguard");
    expect(siteRouteFor("/work/errand-runner")).toBeNull();
    for (const p of ["/careers/ceo", "/careers/driver", "/work/extra", "/careers/personal-assistant/x"]) {
      expect(siteRouteFor(p), p).toBeNull();
    }
  });

  it("has the driver application in both languages", () => {
    expect(siteRouteFor("/drive")?.page).toBe("drive");
    expect(siteRouteFor("/es/chofer")).toEqual({ page: "drive", lang: "es", path: "/es/chofer" });
  });

  it("does not know addresses the site does not have", () => {
    for (const p of ["/account", "/master", "/employee", "/es/nada", "/wp-admin", "/index.php"]) {
      expect(siteRouteFor(p), p).toBeNull();
    }
    expect(isPrivateSitePath("/master")).toBe(true);
    expect(isPrivateSitePath("/Employee/")).toBe(true);
    expect(isPrivateSitePath("/")).toBe(false);
  });

  it("normalises case and trailing slashes without losing the root", () => {
    expect(normalizeSitePath("/")).toBe("/");
    expect(normalizeSitePath("")).toBe("/");
    expect(normalizeSitePath("/Careers//")).toBe("/careers");
  });
});

describe("the same page in the other language", () => {
  it("pairs each page with its twin", () => {
    expect(alternateSiteRoute(siteRouteFor("/")!, "es").path).toBe("/es");
    expect(alternateSiteRoute(siteRouteFor("/es/trabajo")!, "en").path).toBe("/careers");
    expect(alternateSiteRoute(siteRouteFor("/careers/nurse")!, "es").path).toBe("/es/trabajo/nurse");
    expect(sitePathFor("drive", "es")).toBe("/es/chofer");
  });

  it("only a Spanish address insists on its language", () => {
    expect(languageOfSitePath("/es")).toBe("es");
    expect(languageOfSitePath("/trabajo")).toBe("es");
    expect(languageOfSitePath("/")).toBeNull();
    expect(languageOfSitePath("/careers")).toBeNull();
    expect(languageOfSitePath("/master")).toBeNull();
  });

  it("moves the address bar when the language is switched, and only on a public page", () => {
    expect(sitePathInLanguage("/", "es")).toBe("/es");
    expect(sitePathInLanguage("/es/", "en")).toBe("/");
    expect(sitePathInLanguage("/work", "es")).toBe("/es/trabajo");
    expect(sitePathInLanguage("/", "en")).toBeNull();
    expect(sitePathInLanguage("/es", "es")).toBeNull();
    expect(sitePathInLanguage("/employee", "es")).toBeNull();
  });
});

describe("what goes in the sitemap", () => {
  it("lists both languages of every page, and a job page only for a job that is open", () => {
    const paths = indexableSiteRoutes(["personal-assistant"]).map((r) => r.path);
    expect(paths).toEqual([
      "/", "/es", "/careers", "/es/trabajo", "/drive", "/es/chofer",
      "/careers/personal-assistant", "/es/trabajo/personal-assistant",
    ]);
    expect(indexableSiteRoutes([]).some((r) => r.page === "job")).toBe(false);
    // The driver job has its own page, so it never gets one under careers.
    expect(indexableSiteRoutes(["driver"]).some((r) => r.page === "job")).toBe(false);
  });
});
