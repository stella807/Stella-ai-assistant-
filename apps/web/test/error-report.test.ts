import { describe, expect, it } from "vitest";
import { buildErrorReport, shouldReportError } from "../src/app/error-report.ts";

describe("shouldReportError", () => {
  it("skips the noise every site gets and nobody can fix", () => {
    expect(shouldReportError("ResizeObserver loop completed with undelivered notifications.")).toBe(false);
    expect(shouldReportError("Script error.")).toBe(false);
    expect(shouldReportError("")).toBe(false);
    expect(shouldReportError("Non-Error promise rejection captured with value: undefined")).toBe(false);
  });
  it("reports a real failure", () => {
    expect(shouldReportError("Cannot read properties of undefined (reading 'map')")).toBe(true);
  });
});

describe("buildErrorReport", () => {
  it("keeps what helps find the bug and nothing that identifies the person", () => {
    const r = buildErrorReport({
      message: "boom", stack: "Error: boom\n at f (https://safehubby.com/assets/index-abc.js:1:2)", kind: "error",
      href: "https://safehubby.com/careers?ref=secret#frag", userAgent: "Mozilla/5.0 (iPhone)",
    });
    expect(r.path).toBe("/careers");
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(JSON.stringify(r)).not.toContain("frag");
    expect(r.message).toBe("boom");
    expect(r.kind).toBe("error");
  });
  it("cuts long text so one bad error cannot flood the log", () => {
    const r = buildErrorReport({ message: "x".repeat(5000), stack: "y".repeat(9000), kind: "rejection", href: "https://safehubby.com/", userAgent: "z".repeat(900) });
    expect(r.message.length).toBeLessThanOrEqual(300);
    expect((r.stack ?? "").length).toBeLessThanOrEqual(1200);
    expect(r.userAgent.length).toBeLessThanOrEqual(160);
  });
});
