/**
 * A link or image address from data the server holds (a vendor's link, a photo, an order link) is used only when
 * it is a plain web address. `javascript:` and other schemes would run code when clicked, so they become nothing.
 * Embedded images (`data:image/...`) are allowed for photos only.
 */
export function safeHttpUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://safehubby.com");
    return url.protocol === "https:" || url.protocol === "http:" ? value : undefined;
  } catch { return undefined; }
}

export function safeImageSrc(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  return /^data:image\/(png|jpeg|webp|gif);base64,/i.test(value) ? value : safeHttpUrl(value);
}
