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

/**
 * Saves a file to disk from its base64, rather than opening it in the page.
 *
 * A résumé is somebody else's file. Opening it inline would render it from
 * this app's own origin; a download makes the browser treat it as a file, to
 * be opened in whatever opens PDFs on the owner's machine.
 */
export function downloadBase64(fileName: string, mimeType: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  // The applicant chose this name. Kept to a plain file name so a crafted one
  // cannot carry a path.
  link.download = Array.from(fileName, (ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? "_" : ch))
    .join("").slice(0, 120) || "resume";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
