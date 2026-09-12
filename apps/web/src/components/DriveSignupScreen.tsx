import { useState } from "react";
import { DRIVER_RATE_CARD, driverEarningsCents } from "@safehubby/core";
import { api, type DriverApplicationInput } from "../api.ts";

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
 * way to check status or withdraw later, so it's shown plainly rather than
 * emailed — there is no email delivery wired up yet either.
 */
export function DriveSignupScreen({ onBack }: { onBack: () => void }) {
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);

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
        backgroundCheckConsent: consent,
      });
      setSubmitted(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit that application");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="stack">
        <section className="card">
          <h2>Application received</h2>
          <p className="small">
            Your application id is <strong style={{ userSelect: "all" }}>{submitted.id}</strong>. Save it — it
            is the only way to check on your application or withdraw it later.
          </p>
          <p className="small muted">
            A background check is required before approval. We&apos;ll follow up at the email you gave.
          </p>
          <button className="btn btn-block" onClick={onBack}>Back</button>
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
        <h2>Drive for Safehubby</h2>
        <button className="btn btn-sm btn-ghost" onClick={onBack}>Back</button>
      </div>

      <section className="card">
        <h3>Which tier</h3>
        <div className="row">
          <button className={`btn grow${tier === "standard" ? " btn-primary" : ""}`} onClick={() => setTier("standard")}>
            Standard
          </button>
          <button className={`btn grow${tier === "secure-transport" ? " btn-primary" : ""}`} onClick={() => setTier("secure-transport")}>
            Secure transport
          </button>
        </div>
        <p className="tiny muted">
          {tier === "secure-transport"
            ? "For licensed protective-services, military, or law-enforcement professionals. Requires a verifiable protective-services licence in addition to everything below."
            : "A driving licence, a roadworthy vehicle, and a background check."}
        </p>
      </section>

      <section className="card">
        <h3>Pay</h3>
        <p className="small">
          ${(DRIVER_RATE_CARD[tier].baseCents / 100).toFixed(2)} per trip, plus{" "}
          ${(DRIVER_RATE_CARD[tier].perMileCents / 100).toFixed(2)}/mile and{" "}
          ${(DRIVER_RATE_CARD[tier].perMinuteCents / 100).toFixed(2)}/minute — a base, plus what the trip
          actually costs in distance and time, not one flat number for every trip length.
        </p>
        <p className="tiny muted">
          Example: a 5-mile, 15-minute trip pays about ${(driverEarningsCents(tier, 5, 15) / 100).toFixed(2)}.
          {tier === "secure-transport"
            ? " Higher than standard by design — it reflects the real, ongoing cost of a licensed protective-services driver's insurance and training, not a premium for the job sounding riskier."
            : ""}
        </p>
        <p className="tiny muted">
          Nobody is dispatched from this list yet — see the note after you apply. This is the rate that
          will apply once driving for Safehubby is live, published now rather than decided later.
        </p>
      </section>

      <section className="card">
        <h3>About you</h3>
        <div className="field">
          <label htmlFor="fullName">Full name</label>
          <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="row">
          <div className="field grow">
            <label htmlFor="city">City</label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="field grow">
            <label htmlFor="state">State</label>
            <input id="state" maxLength={2} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} />
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Driver&apos;s licence</h3>
        <div className="field">
          <label htmlFor="licenseNumber">Licence number</label>
          <input id="licenseNumber" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="licenseExpiry">Expiry date</label>
          <input id="licenseExpiry" type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="yearsDriving">Years driving</label>
          <input id="yearsDriving" inputMode="numeric" value={yearsDriving} onChange={(e) => setYearsDriving(e.target.value.replace(/\D/g, ""))} />
        </div>
      </section>

      <section className="card">
        <h3>Vehicle</h3>
        <div className="row">
          <div className="field grow">
            <label htmlFor="make">Make</label>
            <input id="make" value={make} onChange={(e) => setMake(e.target.value)} />
          </div>
          <div className="field grow">
            <label htmlFor="model">Model</label>
            <input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field grow">
            <label htmlFor="year">Year</label>
            <input id="year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="field grow">
            <label htmlFor="plate">Licence plate</label>
            <input id="plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
          </div>
        </div>
      </section>

      {tier === "secure-transport" && (
        <section className="card">
          <h3>Protective-services licence</h3>
          <p className="tiny muted">
            Required for this tier. Safehubby does not itself verify whether a given state&apos;s licence is
            genuine — a background-check vendor and legal counsel do — but the application cannot omit the
            field that makes that check possible.
          </p>
          <div className="field">
            <label htmlFor="protLicense">Licence number</label>
            <input id="protLicense" value={protectiveLicenseNumber} onChange={(e) => setProtectiveLicenseNumber(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="protState">Issuing state</label>
            <input id="protState" maxLength={2} value={protectiveLicenseState} onChange={(e) => setProtectiveLicenseState(e.target.value.toUpperCase())} />
          </div>
          <div className="field">
            <label htmlFor="protYears">Years of protective, military, or law-enforcement experience</label>
            <input id="protYears" inputMode="numeric" value={yearsProtective} onChange={(e) => setYearsProtective(e.target.value.replace(/\D/g, ""))} />
          </div>
        </section>
      )}

      <section className="card">
        <label className="row" style={{ alignItems: "flex-start", gap: 8 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 4 }} />
          <span className="small">
            I consent to a background check, including driving record and, for secure transport, licence
            verification.
          </span>
        </label>
        <button className="btn btn-primary btn-block" disabled={busy || !ready} onClick={submit}>
          Submit application
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </section>
    </div>
  );
}
