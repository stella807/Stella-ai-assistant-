import { useEffect, useState } from "react";
import { api, type HiringBenefit, type StaffRoleInfo } from "../api.ts";
import { readFileAsBase64 } from "../files.ts";
import { MAX_RESUME_BYTES } from "@safehubby/core";

/**
 * The public application for the roles that do not drive — personal
 * assistant, errand runner, secretary.
 *
 * Separate screen from `DriveSignupScreen` for the same reason the domain
 * keeps two application types: a secretary has no vehicle, no plate, and no
 * licence expiry, and a form that asks anyway is a form that tells people
 * they are applying for the wrong thing.
 *
 * No account is needed. The id returned is the only way to withdraw later, so
 * it is shown plainly rather than emailed — there is no mail delivery wired
 * up (see adapters/email.ts), and a page that says "check your email" when
 * nothing was sent is worse than one that hands you the reference.
 */
export function StaffSignupScreen({ onBack }: { onBack: () => void }) {
  const [roles, setRoles] = useState<StaffRoleInfo[]>([]);
  const [benefits, setBenefits] = useState<HiringBenefit[]>([]);
  const [role, setRole] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [experience, setExperience] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("20");
  const [consent, setConsent] = useState(false);
  const [resume, setResume] = useState<{ base64: string; mimeType: string; fileName: string } | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);

  const onResumeChosen = async (file: File | undefined) => {
    setResumeError(null);
    if (!file) { setResume(null); return; }
    if (file.size > MAX_RESUME_BYTES) {
      setResumeError("That file is too large — try a smaller PDF or a more compressed photo.");
      return;
    }
    try {
      const { base64, mimeType } = await readFileAsBase64(file);
      setResume({ base64, mimeType, fileName: file.name });
    } catch {
      setResumeError("Could not read that file — try again.");
    }
  };

  useEffect(() => {
    api.staffRoles()
      .then((r) => { setRoles(r.roles); setBenefits(r.benefits); setRole((cur) => cur || r.roles[0]?.id || ""); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the open roles."));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.applyForStaffRole({
        role, fullName, email, phone, city, state, experience,
        hoursPerWeek: Number(hoursPerWeek),
        backgroundCheckConsent: consent,
        ...(resume ? { resume } : {}),
      });
      setSubmitted({ id: res.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <section className="card stack">
        <h2>Application received</h2>
        <p className="small">
          Keep this reference — it is how you check on or withdraw your application, and nothing has been
          emailed to you.
        </p>
        <div className="share-code">
          <span className="tiny muted">Your reference</span>
          <strong>{submitted.id}</strong>
        </div>
        <button className="btn btn-block btn-ghost" onClick={onBack}>Back</button>
      </section>
    );
  }

  const selected = roles.find((r) => r.id === role);
  // Benefits that apply to this role, so the gas stipend does not appear on a
  // secretary's form. `roles` absent means everyone.
  const shown = benefits.filter((b) => !b.roles || b.roles.includes(role));
  const ready = role && fullName.trim() && email.trim() && phone.trim() && city.trim()
    && state.trim() && experience.trim().length >= 20 && Number(hoursPerWeek) > 0 && consent;

  return (
    <div className="stack">
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>← Back</button>

      <section className="card stack">
        <h2>Work with Safehubby</h2>
        <p className="small muted" style={{ margin: 0 }}>
          We're hiring ahead of launch. Pick the role that fits and tell us a little about yourself — the
          rate is published before you apply. A résumé is welcome but optional: the sentence or two about
          your experience below is what actually gets read either way.
        </p>
      </section>

      {shown.length > 0 && (
        <section className="card stack">
          <h3>What you get</h3>
          {shown.map((b) => (
            <div key={b.id} className="stack" style={{ gap: 2 }}>
              <strong className="small">{b.label}</strong>
              <p className="tiny muted" style={{ margin: 0 }}>{b.detail}</p>
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <div className="chip-grid">
          {roles.map((r) => (
            <button key={r.id} className={`chip${r.id === role ? " chip-on" : ""}`}
              aria-pressed={r.id === role} onClick={() => setRole(r.id)}>
              <strong>{r.label}</strong>
              <span className="tiny">{r.description}</span>
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="s-name">Your name</label>
          <input id="s-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="s-email">Email</label>
          <input id="s-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="s-phone">Phone</label>
          <input id="s-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="row" style={{ gap: 8 }}>
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="s-city">City</label>
            <input id="s-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="s-state">State</label>
            <input id="s-state" maxLength={2} autoCapitalize="characters" value={state}
              onChange={(e) => setState(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="s-exp">Relevant experience</label>
          <textarea id="s-exp" rows={3} maxLength={600} value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="A sentence or two. Looking after people counts, whether or not it was a job." />
        </div>

        <div className="field">
          <label htmlFor="s-resume">Résumé (optional)</label>
          <input id="s-resume" type="file" accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => onResumeChosen(e.target.files?.[0])} />
          {resume && <p className="tiny muted" style={{ margin: 0 }}>Attached: {resume.fileName}</p>}
          {resumeError && <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{resumeError}</p>}
        </div>

        <div className="field">
          <label htmlFor="s-hours">Hours a week you're looking for</label>
          <input id="s-hours" type="number" min={1} max={80} value={hoursPerWeek}
            onChange={(e) => setHoursPerWeek(e.target.value)} />
        </div>

        <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="tiny">
            I consent to a background check. {selected && !selected.drives
              ? "This is in-person work with people who may be vulnerable, so it is required for every role."
              : "Required for every role."}
          </span>
        </label>

        <button className="btn btn-primary btn-block" disabled={busy || !ready} onClick={submit}>
          Apply
        </button>

        {error && <div className="banner banner-danger">{error}</div>}
      </section>
    </div>
  );
}
