import { useState } from "react";
import { DRIVER_RATE_CARD, MAX_RESUME_BYTES, benefitsFor, driverEarningsCents } from "@safehubby/core";
import { api, type DriverApplicationInput } from "../api.ts";
import { readFileAsBase64 } from "../files.ts";
import { useLanguage } from "../i18n.tsx";
import { BENEFIT_ES, CAREERS, DRIVE } from "../app/careers-copy.ts";

/**
 * The public application form to drive for Safehubby.
 *
 * Separate from the Uber and Instacart integrations, which bring their own
 * drivers and shoppers — this is the intake for whatever Safehubby vets and
 * staffs directly. Today that's nothing yet, but the secure-transport tier
 * cannot exist as more than a page describing it without this: it has to be
 * staffed by name and verified licence, never by API key.
 *
 * No account is needed to apply. The id returned after submitting is the only
 * way to check status or withdraw later, so it is always shown here.
 */
export function DriveSignupScreen({ onBack }: { onBack: () => void }) {
  const { language } = useLanguage();
  const lang = language === "es" ? "es" : "en";
  const w = DRIVE[lang];
  const shared = CAREERS[lang];
  const [tier, setTier] = useState<DriverApplicationInput["tier"]>("standard");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [yearsDriving, setYearsDriving] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plate, setPlate] = useState("");
  const [protectiveLicenseNumber, setProtectiveLicenseNumber] = useState("");
  const [protectiveLicenseState, setProtectiveLicenseState] = useState("");
  const [yearsProtective, setYearsProtective] = useState("");
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
      setResumeError(shared.tooBig);
      return;
    }
    try {
      const { base64, mimeType } = await readFileAsBase64(file);
      setResume({ base64, mimeType, fileName: file.name });
    } catch {
      setResumeError(shared.unreadable);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.applyToDrive({
        tier,
        fullName, email, phone, city, state,
        licenseNumber,
        licenseExpiry: new Date(licenseExpiry).toISOString(),
        yearsDriving: Number(yearsDriving),
        vehicle: { make, model, year: Number(year), licensePlate: plate },
        ...(tier === "secure-transport"
          ? {
              protectiveLicenseNumber,
              protectiveLicenseState,
              yearsProtectiveExperience: Number(yearsProtective),
            }
          : {}),
        ...(resume ? { resume } : {}),
        backgroundCheckConsent: consent,
      });
      setSubmitted(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : w.failed);
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="stack">
        <section className="card">
          <h2>{shared.received}</h2>
          <p className="small">
            {w.yourId} <strong style={{ userSelect: "all" }}>{submitted.id}</strong>. {w.saveIt}
          </p>
          <p className="small muted">{w.followUp}</p>
          <button className="btn btn-block" onClick={onBack}>{w.back}</button>
        </section>
      </div>
    );
  }

  const ready =
    fullName && email && phone && city && state && licenseNumber && licenseExpiry && yearsDriving &&
    make && model && year && plate && consent &&
    (tier === "standard" || (protectiveLicenseNumber && protectiveLicenseState && yearsProtective));

  return (
    <div className="stack">
      <div className="row-between">
        <h2>{w.title}</h2>
        <button className="btn btn-sm btn-ghost" onClick={onBack}>{w.back}</button>
      </div>

      <section className="card">
        <h3>{w.tier}</h3>
        <div className="row">
          <button className={`btn grow${tier === "standard" ? " btn-primary" : ""}`} onClick={() => setTier("standard")}>
            {w.standard}
          </button>
          <button className={`btn grow${tier === "secure-transport" ? " btn-primary" : ""}`} onClick={() => setTier("secure-transport")}>
            {w.secure}
          </button>
        </div>
        <p className="tiny muted">
          {tier === "secure-transport" ? w.secureNote : w.standardNote}
        </p>
      </section>

      {/* What a driver is promised, from the same list the staff form reads,
          so the gas stipend is visible to the people it is actually for
          rather than only to roles that do not get it. */}
      <section className="card stack">
        <h3>{shared.youGet}</h3>
        {benefitsFor("driver").map((b) => (
          <div key={b.id} className="stack" style={{ gap: 2 }}>
            <strong className="small">{lang === "es" ? BENEFIT_ES[b.id]?.label ?? b.label : b.label}</strong>
            <p className="tiny muted" style={{ margin: 0 }}>{lang === "es" ? BENEFIT_ES[b.id]?.detail ?? b.detail : b.detail}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>{w.pay}</h3>
        <p className="small">
          {w.payLine(DRIVER_RATE_CARD[tier].baseCents, DRIVER_RATE_CARD[tier].perMileCents, DRIVER_RATE_CARD[tier].perMinuteCents)}
        </p>
        <p className="tiny muted">
          {w.example(driverEarningsCents(tier, 5, 15))}
          {tier === "secure-transport" ? w.secureWhy : ""}
        </p>
        <p className="tiny muted">{w.notLive}</p>
      </section>

      <section className="card">
        <h3>{w.aboutYou}</h3>
        <div className="field">
          <label htmlFor="fullName">{w.fullName}</label>
          <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">{shared.email}</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="phone">{shared.phone}</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="row">
          <div className="field grow">
            <label htmlFor="city">{shared.city}</label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="field grow">
            <label htmlFor="state">{shared.state}</label>
            <input id="state" maxLength={2} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} />
          </div>
        </div>
      </section>

      <section className="card">
        <h3>{w.licence}</h3>
        <div className="field">
          <label htmlFor="licenseNumber">{w.licenceNumber}</label>
          <input id="licenseNumber" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="licenseExpiry">{w.expiry}</label>
          <input id="licenseExpiry" type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="yearsDriving">{w.yearsDriving}</label>
          <input id="yearsDriving" inputMode="numeric" value={yearsDriving} onChange={(e) => setYearsDriving(e.target.value.replace(/\D/g, ""))} />
        </div>
      </section>

      <section className="card">
        <h3>{w.vehicle}</h3>
        <div className="row">
          <div className="field grow">
            <label htmlFor="make">{w.make}</label>
            <input id="make" value={make} onChange={(e) => setMake(e.target.value)} />
          </div>
          <div className="field grow">
            <label htmlFor="model">{w.model}</label>
            <input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field grow">
            <label htmlFor="year">{w.year}</label>
            <input id="year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="field grow">
            <label htmlFor="plate">{w.plate}</label>
            <input id="plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
          </div>
        </div>
      </section>

      {tier === "secure-transport" && (
        <section className="card">
          <h3>{w.protective}</h3>
          <p className="tiny muted">{w.protectiveNote}</p>
          <div className="field">
            <label htmlFor="protLicense">{w.licenceNumber}</label>
            <input id="protLicense" value={protectiveLicenseNumber} onChange={(e) => setProtectiveLicenseNumber(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="protState">{w.issuingState}</label>
            <input id="protState" maxLength={2} value={protectiveLicenseState} onChange={(e) => setProtectiveLicenseState(e.target.value.toUpperCase())} />
          </div>
          <div className="field">
            <label htmlFor="protYears">{w.yearsProtective}</label>
            <input id="protYears" inputMode="numeric" value={yearsProtective} onChange={(e) => setYearsProtective(e.target.value.replace(/\D/g, ""))} />
          </div>
        </section>
      )}

      <section className="card">
        <h3>{w.resumeTitle}</h3>
        <p className="tiny muted">{w.resumeNote}</p>
        <div className="field">
          <label htmlFor="resume">{w.attach}</label>
          <input id="resume" type="file" accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => onResumeChosen(e.target.files?.[0])} />
          {resume && <p className="tiny muted" style={{ margin: 0 }}>{shared.attached} {resume.fileName}</p>}
          {resumeError && <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{resumeError}</p>}
        </div>
      </section>

      <section className="card">
        <label className="row" style={{ alignItems: "flex-start", gap: 8 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="small">{w.consent}</span>
        </label>
        <button className="btn btn-primary btn-block" disabled={busy || !ready} onClick={submit}>
          {w.submit}
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </section>
    </div>
  );
}
