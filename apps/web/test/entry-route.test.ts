import { describe, expect, it } from "vitest";
import { entryRoleFromHash, entryRouteFromHash, hashForEntryRoute } from "../src/app/entry-route.ts";

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
