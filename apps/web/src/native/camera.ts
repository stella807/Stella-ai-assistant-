/**
 * A single on-the-spot selfie, not a persistent profile photo.
 *
 * Uses the native camera-capture file input (`capture="user"`) rather than a
 * live `getUserMedia` preview: it needs one photo, not a viewfinder, and the
 * OS's own camera UI already does framing and a shutter better than a custom
 * one would. The trade is a full-screen native camera app for a moment
 * instead of an in-page preview — worth it for something this infrequent.
 */
export function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      resolve({ base64: result.slice(result.indexOf(",") + 1), mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that photo."));
    reader.readAsDataURL(file);
  });
}
