import { describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadOnceForNewVersion } from "../src/app/lazy-import.ts";

describe("stale code chunks", () => {
  it("recognises the browser's messages for a chunk that failed to load", () => {
    for (const m of ["Importing a module script failed.", "Failed to fetch dynamically imported module: /a.js", "Loading chunk 4 failed."]) {
      expect(isChunkLoadError(new TypeError(m)), m).toBe(true);
    }
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
    expect(isChunkLoadError("nope")).toBe(false);
  });

  it("reloads once per session, never in a loop", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const reload = vi.fn();
    expect(reloadOnceForNewVersion(storage, reload)).toBe(true);
    expect(reloadOnceForNewVersion(storage, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
