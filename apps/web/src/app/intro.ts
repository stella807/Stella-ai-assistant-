import { emitWarp } from "./warp.ts";

const SEEN_KEY = "sh_intro_seen";

/** The opening plays on the home page only, once a visit, and never for someone who asked their device for less motion. */
export function shouldPlayIntro(path: string, seen: boolean, reduceMotion: boolean): boolean {
  if (seen || reduceMotion) return false;
  const p = path.replace(/\/+$/, "") || "/";
  return p === "/" || p === "/es";
}

/** When the portal opens, in ms from the start; intro.css is timed to match. */
const OPEN_AT = 1050;
const DONE_AT = 1900;

/**
 * The opening: the shield resolves out of a blur inside rings of light, the name
 * tracks in beneath it, then a flash and the camera flies through the shield as
 * a circle opens onto the site and the background streams past. The hero's own
 * entrance is held back until the portal opens, so it plays where it can be seen.
 * A tap anywhere skips it.
 */
export function playIntro(): void {
  let seen = false;
  try { seen = sessionStorage.getItem(SEEN_KEY) === "1"; } catch { /* storage blocked: play it */ }
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (!shouldPlayIntro(window.location.pathname, seen, reduce)) return;
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* it will play again next load, which is fine */ }

  const root = document.documentElement;
  const overlay = document.createElement("div");
  overlay.className = "intro";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `<span class="intro-ring"></span><span class="intro-ring intro-ring-2"></span><img class="intro-logo" src="/favicon.png" alt="" width="96" height="96"><span class="intro-word">SAFEHUBBY</span>`;
  root.classList.add("intro-playing");
  document.body.appendChild(overlay);

  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    root.classList.remove("intro-playing");
    emitWarp(1);
  };
  const finish = () => { open(); overlay.remove(); };
  const timers = [window.setTimeout(open, OPEN_AT), window.setTimeout(finish, DONE_AT)];
  overlay.addEventListener("pointerdown", () => { timers.forEach(clearTimeout); finish(); }, { once: true });
}
