import { describe, expect, it } from "vitest";
import {
  entryRoleFromHash, entryRoleFromUrl, entryRouteFromHash, entryRouteFromUrl, hashForEntryRoute, pathAfterLeaving,
} from "../src/app/entry-route.ts";

describe("opening the app on a specific screen from a link", () => {
  it("opens the careers application from #careers", () => {
    // The hiring ad and the website's "See open roles" button point here, so a
    // person applying lands on the form rather than on a sales landing page
    // with a small Careers button to find.
    expect(entryRouteFromHash("#careers")).toBe("work");
  });

  it("opens the driver application from #drive", () => {
    expect(entryRouteFromHash("#drive")).toBe("drive");
  });

  it("ignores case, a leading slash, and trailing noise", () => {
    expect(entryRouteFromHash("#Careers")).toBe("work");
    expect(entryRouteFromHash("#/careers")).toBe("work");
    expect(entryRouteFromHash("#careers?utm_source=instagram")).toBe("work");
  });

  it("opens nothing for anything else, including an empty hash", () => {
    for (const h of ["", "#", "#plans", "#account", "#careers-extra", "careers"]) {
      expect(entryRouteFromHash(h), h).toBe("out");
    }
  });

  it("round-trips, so Back from the form clears the link and a refresh does not reopen it", () => {
    expect(hashForEntryRoute("work")).toBe("#careers");
    expect(hashForEntryRoute("drive")).toBe("#drive");
    expect(hashForEntryRoute("out")).toBe("");
    expect(entryRouteFromHash(hashForEntryRoute("work"))).toBe("work");
  });
});

describe("choosing the role from the link", () => {
  it("reads the role an ad asks for", () => {
    expect(entryRoleFromHash("#careers?role=errand-runner")).toBe("errand-runner");
    expect(entryRoleFromHash("#careers?utm_source=ig&role=personal-assistant")).toBe("personal-assistant");
  });

  it("asks for nothing unless it is the careers link", () => {
    expect(entryRoleFromHash("#careers")).toBeUndefined();
    expect(entryRoleFromHash("#drive?role=errand-runner")).toBeUndefined();
    expect(entryRoleFromHash("")).toBeUndefined();
  });

  it("refuses a role value that is not shaped like one", () => {
    for (const bad of ["#careers?role=", "#careers?role=<script>", "#careers?role=a b", `#careers?role=${"x".repeat(50)}`]) {
      expect(entryRoleFromHash(bad), bad).toBeUndefined();
    }
  });
});

describe("opening the app from a plain address, not just a hash", () => {
  // The hiring flyer prints safehubby.com/work. With the whole site on one
  // domain there is no separate marketing page behind that address, so the app
  // itself has to answer it.
  it("treats /work and its Spanish twin as the careers application", () => {
    for (const p of ["/work", "/work/", "/Work", "/careers", "/trabajo", "/es/trabajo", "/es/trabajo/"]) {
      expect(entryRouteFromUrl({ pathname: p, hash: "" }), p).toBe("work");
    }
  });
  it("treats /drive as the driver application", () => {
    expect(entryRouteFromUrl({ pathname: "/drive", hash: "" })).toBe("drive");
  });
  it("opens nothing for the home page or an address that is not one of these", () => {
    for (const p of ["/", "/account", "/worker", "/work/extra", "/master"]) {
      expect(entryRouteFromUrl({ pathname: p, hash: "" }), p).toBe("out");
    }
  });
  it("still honours the hash on the home page", () => {
    expect(entryRouteFromUrl({ pathname: "/", hash: "#careers" })).toBe("work");
  });
  it("reads the role from the query string of a plain address too", () => {
    expect(entryRoleFromUrl({ pathname: "/work", hash: "", search: "?role=personal-assistant" })).toBe("personal-assistant");
    expect(entryRoleFromUrl({ pathname: "/", hash: "#careers?role=lawyer", search: "" })).toBe("lawyer");
    expect(entryRoleFromUrl({ pathname: "/work", hash: "", search: "?role=../etc" })).toBeUndefined();
  });
  it("sends a person back to the home address when they leave the form", () => {
    expect(pathAfterLeaving("/work")).toBe("/");
    expect(pathAfterLeaving("/es/trabajo/")).toBe("/");
    expect(pathAfterLeaving("/")).toBe("/");
    expect(pathAfterLeaving("/master")).toBe("/master");
  });
});
