import { approximateDecodedBytes } from "./voice-messages.ts";

/**
 * A résumé attached to a job application — staff or driver, either one.
 *
 * The application forms used to say plainly that there was no résumé
 * upload, because there was nowhere for one to go: this prototype has no
 * object storage (no S3-equivalent adapter anywhere in this codebase), so
 * "upload a file" can only ever mean one honest thing here — a small file
 * carried inline as base64, the same way a selfie is (see
 * `IdentityPhoto`/`validateIdentityPhoto` in concierge.ts) and a voice clip
 * is (voice-messages.ts). A résumé is usually a one- or two-page PDF, well
 * under the ceiling below, so that shape covers the real case without
 * pretending this is a document-management system.
 */
export interface Resume {
  base64: string;
  mimeType: string;
  /** The applicant's own filename, shown back to whoever reviews it —
   *  "resume.pdf" tells a reviewer nothing; "jordan-rivera-resume.pdf" does. */
  fileName: string;
  uploadedAt: string;
}

/** A PDF, or a clear photo of a printed one — the two things someone
 *  applying from a phone can actually produce. */
const ALLOWED_RESUME_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** A couple of megabytes comfortably covers a text-based résumé PDF or a
 *  phone photo of one at reasonable compression — bounded for the same
 *  reason `MAX_PHOTO_BYTES` is: this store cannot hold much more than that
 *  per item. */
export const MAX_RESUME_BYTES = 3_000_000;

export function validateResume(input: { base64: string; mimeType: string; fileName: string }): void {
  if (!input.base64.trim()) throw new Error("No résumé was attached.");
  if (!ALLOWED_RESUME_MIME_TYPES.includes(input.mimeType)) {
    throw new Error("Attach a PDF, or a clear photo of a printed résumé.");
  }
  if (!input.fileName.trim()) throw new Error("That file needs a name.");
  if (approximateDecodedBytes(input.base64) > MAX_RESUME_BYTES) {
    throw new Error("That file is too large — try a smaller PDF or a more compressed photo.");
  }
}
