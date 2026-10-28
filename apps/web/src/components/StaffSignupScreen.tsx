import { useEffect, useState } from "react";
import { api, type HiringBenefit, type StaffRoleInfo } from "../api.ts";
import { readFileAsBase64 } from "../files.ts";
import { MAX_RESUME_BYTES, payLabelFor, requiresInsurance, type StaffRole } from "@safehubby/core";
import { CredentialFields, credentialPayload, emptyCredential, isCredentialFilled } from "./CredentialFields.tsx";
import { useLanguage } from "../i18n.tsx";
import { PublicWorkerPay } from "./PublicPricing.tsx";
import { BENEFIT_ES, ROLE_ES, careersWords } from "../app/careers-copy.ts";

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
 * it is always shown here, whether or not email is set up to send a copy.
 */
export function StaffSignupScreen({ onBack, initialRole }: { onBack: () => void; initialRole?: string }) {
  const { language, t } = useLanguage();
  const lang = language === "es" ? "es" : "en";
  const w = careersWords(lang);
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
  const [insurance, setInsurance] = useState(() => emptyCredential("liability-insurance"));
  const [armedLicences, setArmedLicences] = useState(false);
  const [firearms, setFirearms] = useState(() => emptyCredential("firearms-license"));
  const [guard, setGuard] = useState(() => emptyCredential("guard-license"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);

  const onResumeChosen = async (file: File | undefined) => {
    setResumeError(null);
    if (!file) { setResume(null); return; }
    if (file.size > MAX_RESUME_BYTES) {
      setResumeError(w.tooBig);
      return;
    }
    try {
      const { base64, mimeType } = await readFileAsBase64(file);
      setResume({ base64, mimeType, fileName: file.name });
    } catch {
      setResumeError(w.unreadable);
    }
  };

  useEffect(() => {
    api.staffRoles()
      .then((r) => { setRoles(r.roles); setBenefits(r.benefits); setRole((cur) => cur || (r.roles.some((x) => x.id === initialRole) ? initialRole! : r.roles[0]?.id) || ""); })
      .catch((e) => setError(e instanceof Error ? e.message : w.loadFailed));
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
        credentials: [
          ...(needsInsurance ? [credentialPayload(insurance)] : []),
          ...(needsInsurance && armedLicences ? [credentialPayload(firearms), credentialPayload(guard)] : []),
        ],
      });
      setSubmitted({ id: res.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : w.failed);
    } finally {
      setBusy(false);
    }
  };

  const needsInsurance = Boolean(role) && requiresInsurance(role as StaffRole);
  const credentialsReady = !needsInsurance
    || (isCredentialFilled(insurance) && (!armedLicences || (isCredentialFilled(firearms) && isCredentialFilled(guard))));

  if (submitted) {
    return (
      <section className="card stack">
        <h2>{w.received}</h2>
        <p className="small">{w.keep}</p>
        <div className="share-code">
          <span className="tiny muted">{w.reference}</span>
          <strong>{submitted.id}</strong>
        </div>
        <button className="btn btn-block btn-ghost" onClick={onBack}>{w.done}</button>
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
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>{w.back}</button>

      <section className="card stack">
        <h2>{w.title}</h2>
        <p className="small muted" style={{ margin: 0 }}>{w.lead}</p>
      </section>

      {/* The rate, kept out of the way until asked for: somebody deciding
          whether to apply is who it is for, and they are already here. */}
      <details className="card stack">
        <summary className="small"><strong>{t("pay.heading")}</strong></summary>
        <PublicWorkerPay heading={false} />
      </details>

      {shown.length > 0 && (
        <section className="card stack">
          <h3>{w.youGet}</h3>
          {shown.map((b) => (
            <div key={b.id} className="stack" style={{ gap: 2 }}>
              <strong className="small">{lang === "es" ? BENEFIT_ES[b.id]?.label ?? b.label : b.label}</strong>
              <p className="tiny muted" style={{ margin: 0 }}>{lang === "es" ? BENEFIT_ES[b.id]?.detail ?? b.detail : b.detail}</p>
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <div className="chip-grid">
          {roles.map((r) => (
            <button key={r.id} className={`chip${r.id === role ? " chip-on" : ""}`}
              aria-pressed={r.id === role} onClick={() => setRole(r.id)}>
              <strong>{lang === "es" ? ROLE_ES[r.id]?.label ?? r.label : r.label}</strong>
              <span className="tiny">{lang === "es" ? ROLE_ES[r.id]?.description ?? r.description : r.description}</span>
              {/* What it pays and how many we want, on the card itself: an
                  applicant choosing a role should not have to apply to find
                  out whether the job exists or what it is worth. */}
              <span className="small"><strong>{lang === "es" ? payLabelFor(r.id as StaffRole, "es") : r.pay}</strong></span>
              <span className={`tiny ${r.hiring ? "" : "muted"}`}>
                {r.hiring ? w.hiring(r.openings) : w.notHiring}
              </span>
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="s-name">{w.name}</label>
          <input id="s-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="s-email">{w.email}</label>
          <input id="s-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="s-phone">{w.phone}</label>
          <input id="s-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="row" style={{ gap: 8 }}>
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="s-city">{w.city}</label>
            <input id="s-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="s-state">{w.state}</label>
            <input id="s-state" maxLength={2} autoCapitalize="characters" value={state}
              onChange={(e) => setState(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="s-exp">{w.experience}</label>
          <textarea id="s-exp" rows={3} maxLength={600} value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder={w.experienceHint} />
        </div>

        <div className="field">
          <label htmlFor="s-resume">{w.resume}</label>
          <input id="s-resume" type="file" accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => onResumeChosen(e.target.files?.[0])} />
          {resume && <p className="tiny muted" style={{ margin: 0 }}>{w.attached} {resume.fileName}</p>}
          {resumeError && <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{resumeError}</p>}
        </div>

        {needsInsurance && (
          <>
            <p className="tiny muted" style={{ margin: 0 }}>
              {lang === "es"
                ? "Todo el que va donde los clientes tiene su propio seguro de responsabilidad civil. Adjunta el certificado."
                : "Everyone who goes out to customers carries their own liability insurance. Attach the certificate."}
            </p>
            <CredentialFields value={insurance} onChange={setInsurance} lang={lang} />
            <label className="row small" style={{ gap: 8, alignItems: "flex-start" }}>
              <input type="checkbox" checked={armedLicences} onChange={(e) => setArmedLicences(e.target.checked)} />
              <span>
                {lang === "es"
                  ? "Tengo licencia de armas y licencia de guardia de seguridad, y quiero hacer trabajos armados (opcional, mejor pagados)."
                  : "I hold a firearms licence and a security-guard licence, and want armed jobs (optional, better paid)."}
              </span>
            </label>
            {armedLicences && (
              <>
                <CredentialFields value={firearms} onChange={setFirearms} lang={lang} />
                <CredentialFields value={guard} onChange={setGuard} lang={lang} />
              </>
            )}
          </>
        )}

        <div className="field">
          <label htmlFor="s-hours">{w.hours}</label>
          <input id="s-hours" type="number" min={1} max={80} value={hoursPerWeek}
            onChange={(e) => setHoursPerWeek(e.target.value)} />
        </div>

        <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="tiny">
            {w.consent} {selected && !selected.drives ? w.consentPeople : w.consentAll}
          </span>
        </label>

        <button className="btn btn-primary btn-block" disabled={busy || !ready || !credentialsReady} onClick={submit}>
          {w.apply}
        </button>

        {error && <div className="banner banner-danger">{error}</div>}
      </section>
    </div>
  );
}
