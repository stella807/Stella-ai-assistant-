import { useState } from "react";
import { api } from "../api.ts";
import { readFileAsBase64 } from "../files.ts";

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
  const [birthDate, setBirthDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) return setError("Attach a photo of your ID.");
    setBusy(true);
    setError(null);
    try {
      const doc = await readFileAsBase64(file);
      await api.submitSeniorId(birthDate, { ...doc, fileName: file.name });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h4>Basic is for members {minAge} and over</h4>
      <p className="small muted">
        Add your date of birth and a photo of your driver's licence, state ID or passport. Our team checks it;
        you can start using Basic right away.
      </p>
      {rejectedNote && <div className="banner banner-danger">Your last ID was not accepted: {rejectedNote}</div>}
      <label className="stack">
        <span className="small">Date of birth</span>
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </label>
      <label className="stack">
        <span className="small">Photo of your ID</span>
        <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <div className="banner banner-danger">{error}</div>}
      <div className="row">
        <button className="btn grow" disabled={busy || !birthDate || !file} onClick={submit}>
          {busy ? "Sending…" : "Send my ID"}
        </button>
        <button className="btn btn-ghost grow" disabled={busy} onClick={onCancel}>Back</button>
      </div>
    </div>
  );
}
