export interface ErrorReport {
  kind: "error" | "rejection" | "screen";
  message: string;
  stack?: string;
  /** The page's path only: never the query or the hash, which can carry personal links. */
  path: string;
  userAgent: string;
}

/** Messages every site gets from browsers and extensions that nobody can act on. */
const NOISE = [/^ResizeObserver loop/i, /^Script error\.?$/i, /^Non-Error promise rejection captured/i];

export function shouldReportError(message: string): boolean {
  const m = message.trim();
  return m.length > 0 && !NOISE.some((re) => re.test(m));
}

export function buildErrorReport(input: { message: string; stack?: string; kind: ErrorReport["kind"]; href: string; userAgent: string }): ErrorReport {
  let path = "/";
  try { path = new URL(input.href).pathname; } catch { /* keep "/" */ }
  return {
    kind: input.kind,
    message: input.message.slice(0, 300),
    ...(input.stack ? { stack: input.stack.slice(0, 1200) } : {}),
    path: path.slice(0, 120),
    userAgent: input.userAgent.slice(0, 160),
  };
}

/** Each page load reports a handful of errors at most, and the same one once. */
const MAX_PER_LOAD = 5;
const seen = new Set<string>();

/**
 * Tells the server about a crash a visitor hit, so it can be fixed before
 * anyone has to write in about it. Sent with the browser's own keep-alive, no
 * account or personal detail: just what failed, on which path, in which browser.
 */
export function reportClientError(kind: ErrorReport["kind"], message: string, stack?: string): void {
  if (!shouldReportError(message) || seen.size >= MAX_PER_LOAD || seen.has(message)) return;
  seen.add(message);
  const body = JSON.stringify(buildErrorReport({ message, stack, kind, href: window.location.href, userAgent: navigator.userAgent }));
  try {
    void fetch("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* reporting must never cause an error of its own */ }
}

export function installErrorReport(): void {
  window.addEventListener("error", (e) => reportClientError("error", e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    reportClientError("rejection", r instanceof Error ? r.message : String(r ?? ""), r instanceof Error ? r.stack : undefined);
  });
}
