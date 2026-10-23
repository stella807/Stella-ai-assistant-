import { useState } from "react";
import { MAX_RESUME_BYTES, type CredentialKind } from "@safehubby/core";
import { readFileAsBase64 } from "../files.ts";

/** One credential as the application form holds it, before it is sent. */
export interface CredentialDraft {
  kind: CredentialKind;
  number: string;
  issuer: string;
  /** yyyy-mm-dd, from the date input. */
  expiresOn: string;
  document: { base64: string; mimeType: string; fileName: string } | null;
}

export const emptyCredential = (kind: CredentialKind): CredentialDraft =>
  ({ kind, number: "", issuer: "", expiresOn: "", document: null });

/** The shape the API takes; the server checks it again (credentials.ts). */
export const credentialPayload = (c: CredentialDraft) => ({
  kind: c.kind, number: c.number.trim(), issuer: c.issuer.trim(),
  expiresAt: c.expiresOn ? new Date(`${c.expiresOn}T23:59:59Z`).toISOString() : "",
  document: c.document,
});

export const isCredentialFilled = (c: CredentialDraft) =>
  Boolean(c.number.trim() && c.issuer.trim() && c.expiresOn && c.document);

const WORDS = {
  en: {
    "liability-insurance": { title: "Your liability insurance", number: "Policy number", issuer: "Insurance company" },
    "firearms-license": { title: "Firearms licence", number: "Licence number", issuer: "Issued by" },
    "guard-license": { title: "Security-guard licence", number: "Licence number", issuer: "Issued by" },
    expires: "Expires on", copy: "A copy (PDF or photo)", attached: "Attached:", tooBig: "That file is too large.",
  },
  es: {
    "liability-insurance": { title: "Tu seguro de responsabilidad civil", number: "Número de póliza", issuer: "Aseguradora" },
    "firearms-license": { title: "Licencia de armas", number: "Número de licencia", issuer: "Emitida por" },
    "guard-license": { title: "Licencia de guardia de seguridad", number: "Número de licencia", issuer: "Emitida por" },
    expires: "Vence el", copy: "Una copia (PDF o foto)", attached: "Adjunto:", tooBig: "Ese archivo es muy grande.",
  },
};

/** Number, issuer, expiry and a copy of the document, for one credential. */
export function CredentialFields({ value, onChange, lang }: {
  value: CredentialDraft; onChange: (next: CredentialDraft) => void; lang: "en" | "es";
}) {
  const w = WORDS[lang];
  const k = w[value.kind];
  const [fileError, setFileError] = useState<string | null>(null);
  const id = `cred-${value.kind}`;
  const pick = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return onChange({ ...value, document: null });
    if (file.size > MAX_RESUME_BYTES) return setFileError(w.tooBig);
    const { base64, mimeType } = await readFileAsBase64(file);
    onChange({ ...value, document: { base64, mimeType, fileName: file.name } });
  };
  return (
    <fieldset className="card card-quiet stack" style={{ gap: 8 }}>
      <legend className="small"><strong>{k.title}</strong></legend>
      <div className="field">
        <label htmlFor={`${id}-number`}>{k.number}</label>
        <input id={`${id}-number`} value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-issuer`}>{k.issuer}</label>
        <input id={`${id}-issuer`} value={value.issuer} onChange={(e) => onChange({ ...value, issuer: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-expires`}>{w.expires}</label>
        <input id={`${id}-expires`} type="date" value={value.expiresOn} onChange={(e) => onChange({ ...value, expiresOn: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-doc`}>{w.copy}</label>
        <input id={`${id}-doc`} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => void pick(e.target.files?.[0])} />
        {value.document && <p className="tiny muted" style={{ margin: 0 }}>{w.attached} {value.document.fileName}</p>}
        {fileError && <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{fileError}</p>}
      </div>
    </fieldset>
  );
}
