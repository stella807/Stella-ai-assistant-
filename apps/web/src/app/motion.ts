/**
 * Phones and touch tablets get a lighter version of the site's motion: no
 * second WebGL layer (the fog) and simple fades between the slides in place of
 * the blurred 3D flight. The look stays the same on a desktop; a cheap phone
 * keeps a smooth scroll and its battery.
 */
export function isLightMotion(width: number, coarsePointer: boolean): boolean {
  return width < 760 || (coarsePointer && width < 1100);
}

/** Decides once, at start-up, and marks the page so the stylesheets can follow. */
export function installMotionLevel(): boolean {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const light = isLightMotion(window.innerWidth, coarse);
  if (light) document.documentElement.dataset.motion = "light";
  return light;
}
