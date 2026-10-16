/**
 * The picture a customer sees when choosing an assistant.
 *
 * It comes from the owner at hiring, either as a small image embedded right
 * in the record or as an https address. Whatever it is gets drawn into an
 * `<img>` on a stranger's screen, so only the shapes that can do nothing but
 * show a picture are allowed: no SVG (it can carry script), no plain http, no
 * other scheme, and a ceiling on size so one record cannot bloat every roster
 * response.
 */

/** About 200 KB of image once decoded. */
export const MAX_PROFILE_PHOTO_CHARS = 280_000;

const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

export function validateProfilePhotoUrl(raw: string | undefined): string | undefined {
  const url = (raw ?? "").trim();
  if (!url) return undefined;
  if (url.length >= MAX_PROFILE_PHOTO_CHARS) throw new Error("That photo is too large. Use a smaller one.");
  if (url.startsWith("data:")) {
    if (!DATA_URL.test(url)) throw new Error("The photo must be a JPEG, PNG or WebP image.");
    return url;
  }
  if (/^https:\/\/[^\s]+$/i.test(url) && url.length <= 500) return url;
  throw new Error("The photo must be an uploaded image or an https link.");
}
