/**
 * Reads a small file (a résumé, today) into the `{ base64, mimeType }` shape
 * `Resume` expects — see resume.ts in core for why that shape, and its size
 * ceiling, is what it is. `readAsDataURL` gives back a data URL
 * ("data:application/pdf;base64,...."); this strips the prefix so the
 * stored value is exactly what the server re-encodes, nothing extra to
 * strip again on the way back out.
 */
export function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve({ base64: comma >= 0 ? result.slice(comma + 1) : result, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  });
}
