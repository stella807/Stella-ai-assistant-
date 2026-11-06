import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "safehubby-chunk-reload";

/** Whether this is the browser failing to fetch a code chunk (an old page asking for a file a newer deploy replaced). */
export const isChunkLoadError = (e: unknown): boolean =>
  e instanceof Error && /importing a module script failed|failed to fetch dynamically imported module|loading chunk|error loading dynamically imported module/i.test(e.message);

/** Reloads once per session so a page left open across a deploy picks up the new files; false when it already did. */
export function reloadOnceForNewVersion(storage: Pick<Storage, "getItem" | "setItem"> | undefined, reload: () => void): boolean {
  try {
    if (storage?.getItem(RELOAD_KEY)) return false;
    storage?.setItem(RELOAD_KEY, "1");
  } catch { return false; }
  reload();
  return true;
}

/**
 * `lazy`, for chunks that can go stale: after a deploy an open app still asks for the old hashed file, the import
 * fails, and the screen shows an error. Try once more, then reload the page a single time to fetch the new version.
 */
export function lazyWithReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch (first) {
      if (!isChunkLoadError(first)) throw first;
      try { return await load(); } catch (second) {
        const store = typeof sessionStorage === "undefined" ? undefined : sessionStorage;
        if (reloadOnceForNewVersion(store, () => window.location.reload())) return new Promise<never>(() => {});
        throw second;
      }
    }
  });
}
