/**
 * Turns a picked photo into a small square-ish JPEG, as a data URL, ready to
 * store on the assistant's record. A phone photo is several megabytes; what a
 * customer sees is a tile 90 pixels wide, so it is shrunk here before it ever
 * leaves the browser.
 */
export async function photoToDataUrl(file: File, maxSide = 360, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare the photo.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
