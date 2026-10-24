import { useState } from "react";
import { api } from "../api.ts";
import { readFileAsBase64 } from "../files.ts";
import { useLanguage } from "../i18n.tsx";
import { paymentWords } from "../app/payments-copy.ts";

/**
 * The ID that opens Basic, the plan for elderly members: a date of birth and
 * a photo of a government ID. The server decides; this only collects it.
 */
export function SeniorIdForm({ minAge, rejectedNote, onDone, onCancel }: {
  minAge: number;
  rejectedNote?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { language } = useLanguage();
  const w = paymentWords(language).senior;
  const [birthDate, setBirthDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) return setError(w.attach);
    setBusy(true);
    setError(null);
    try {
      const doc = await readFileAsBase64(file);
      await api.submitSeniorId(birthDate, { ...doc, fileName: file.name });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h4>{w.title(minAge)}</h4>
      <p className="small muted">{w.intro}</p>
      {rejectedNote && <div className="banner banner-danger">{w.rejected} {rejectedNote}</div>}
      <label className="stack">
        <span className="small">{w.birthDate}</span>
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </label>
      <label className="stack">
        <span className="small">{w.photo}</span>
        <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <div className="banner banner-danger">{error}</div>}
      <div className="row">
        <button className="btn grow" disabled={busy || !birthDate || !file} onClick={submit}>
          {busy ? w.sending : w.send}
        </button>
        <button className="btn btn-ghost grow" disabled={busy} onClick={onCancel}>{w.back}</button>
      </div>
    </div>
  );
}
