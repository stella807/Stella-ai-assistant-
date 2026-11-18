import { useState } from "react";
import type { BizMarket, EvidenceTag, InvestorType, LeadKind } from "@safehubby/core";
import { api, type BizDesk } from "../api.ts";
import type { BizLeadView } from "../app/bizdev-view.ts";

const TAGS: { id: EvidenceTag; label: string }[] = [
  { id: "hospitality", label: "Hospitality" }, { id: "transportation", label: "Transportation" }, { id: "security", label: "Security" },
  { id: "concierge", label: "Concierge" }, { id: "travel", label: "Travel" }, { id: "fleet", label: "Vehicles / fleet" },
  { id: "consumer-services", label: "Consumer services" }, { id: "marketing", label: "Marketing" },
  { id: "introductions", label: "Introduces investors" }, { id: "puerto-rico", label: "Puerto Rico" },
];

const EMPTY = {
  name: "", org: "", market: "puerto-rico" as BizMarket, investorType: "angel" as InvestorType, segment: "", location: "",
  website: "", source: "", claim: "", claimUrl: "", tag: "hospitality" as EvidenceTag, comparable: false,
  checkMin: "", checkMax: "", lastInvestmentOn: "", contactName: "", contactKind: "email", contactValue: "", contactSource: "", notes: "",
};

/**
 * Adding a lead by hand. Every fact needs the page it came from, and an email or phone number needs the
 * page it was read on: the server refuses anything else, and this form says so before it is sent.
 */
export function BizLeadForm({ kind, meta, onAdded, onCancel }: {
  kind: LeadKind; meta: BizDesk["meta"]; onAdded: (lead: BizLeadView) => void; onCancel: () => void;
}) {
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const { lead } = await api.bizAddLead({
        kind, name: f.name, org: f.org, market: f.market, location: f.location, website: f.website || undefined,
        investorType: kind === "investor" ? f.investorType : undefined, segment: kind === "investor" ? undefined : f.segment,
        sources: [f.source],
        evidence: f.claim || f.claimUrl ? [{ claim: f.claim, url: f.claimUrl || f.source, tag: f.tag, comparable: f.comparable }] : [],
        typicalCheckUsd: kind === "investor" ? { min: f.checkMin, max: f.checkMax } : undefined,
        lastInvestmentOn: kind === "investor" ? f.lastInvestmentOn : undefined,
        contactName: f.contactName,
        contactChannel: f.contactValue ? { kind: f.contactKind, value: f.contactValue, source: f.contactSource || undefined } : null,
        notes: f.notes,
      });
      onAdded(lead);
      setF(EMPTY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That lead did not save");
    } finally {
      setBusy(false);
    }
  };

  const needsContactSource = f.contactValue && (f.contactKind === "email" || f.contactKind === "phone");

  return (
    <div className="card card-quiet stack" style={{ gap: 8 }}>
      <p className="tiny muted" style={{ margin: 0 }}>
        Only add what a public page shows. Paste the link to that page next to each fact. Never guess an email address.
      </p>
      <div className="field"><label htmlFor="bl-name">{kind === "investor" ? "Investor's name" : "Name of the business or person"}</label>
        <input id="bl-name" value={f.name} maxLength={120} onChange={set("name")} /></div>
      <div className="field"><label htmlFor="bl-org">Company or fund</label>
        <input id="bl-org" value={f.org} maxLength={160} onChange={set("org")} /></div>
      {kind === "investor" ? (
        <div className="field"><label htmlFor="bl-type">Type of investor</label>
          <select id="bl-type" value={f.investorType} onChange={set("investorType")}>
            {meta.investorTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select></div>
      ) : (
        <div className="field"><label htmlFor="bl-seg">What kind of business (hotel, hospital, fleet leasing…)</label>
          <input id="bl-seg" value={f.segment} maxLength={80} onChange={set("segment")} /></div>
      )}
      <div className="field"><label htmlFor="bl-market">Market</label>
        <select id="bl-market" value={f.market} onChange={set("market")}>
          {meta.markets.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select></div>
      <div className="field"><label htmlFor="bl-loc">City</label>
        <input id="bl-loc" value={f.location} maxLength={120} onChange={set("location")} /></div>
      <div className="field"><label htmlFor="bl-web">Website (https)</label>
        <input id="bl-web" inputMode="url" value={f.website} onChange={set("website")} /></div>
      <div className="field"><label htmlFor="bl-src">Where you found them (https link, required)</label>
        <input id="bl-src" inputMode="url" value={f.source} onChange={set("source")} /></div>

      <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
        <legend className="tiny muted">Why they fit (optional, but it is what raises the score)</legend>
        <div className="field"><label htmlFor="bl-claim">What the page shows</label>
          <input id="bl-claim" placeholder="Invested in a San Juan hotel group in 2025" value={f.claim} maxLength={300} onChange={set("claim")} /></div>
        <div className="field"><label htmlFor="bl-claim-url">Link to that page (https)</label>
          <input id="bl-claim-url" inputMode="url" value={f.claimUrl} onChange={set("claimUrl")} /></div>
        <div className="field"><label htmlFor="bl-tag">Area</label>
          <select id="bl-tag" value={f.tag} onChange={set("tag")}>{TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
        <label className="row tiny" style={{ gap: 8, textTransform: "none", letterSpacing: 0 }}>
          <input type="checkbox" checked={f.comparable} onChange={(e) => setF({ ...f, comparable: e.target.checked })} />
          They backed or run a business like Safehubby
        </label>
      </fieldset>

      {kind === "investor" && (
        <>
          <div className="row" style={{ gap: 8 }}>
            <div className="field grow"><label htmlFor="bl-min">Smallest check (USD)</label>
              <input id="bl-min" inputMode="numeric" value={f.checkMin} onChange={set("checkMin")} /></div>
            <div className="field grow"><label htmlFor="bl-max">Largest check (USD)</label>
              <input id="bl-max" inputMode="numeric" value={f.checkMax} onChange={set("checkMax")} /></div>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>Only a check size the investor publishes. A fund's total size is not a check size.</p>
          <div className="field"><label htmlFor="bl-last">Date of their latest investment</label>
            <input id="bl-last" type="date" value={f.lastInvestmentOn} onChange={set("lastInvestmentOn")} /></div>
        </>
      )}

      <div className="field"><label htmlFor="bl-cname">Person to contact</label>
        <input id="bl-cname" value={f.contactName} maxLength={120} onChange={set("contactName")} /></div>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ minWidth: 110 }}><label htmlFor="bl-ckind">How</label>
          <select id="bl-ckind" value={f.contactKind} onChange={set("contactKind")}>
            <option value="email">Email</option><option value="phone">Phone</option><option value="form">Contact form</option><option value="linkedin">LinkedIn</option>
          </select></div>
        <div className="field grow"><label htmlFor="bl-cval">{f.contactKind === "form" || f.contactKind === "linkedin" ? "Link (https)" : f.contactKind === "phone" ? "Number" : "Address"}</label>
          <input id="bl-cval" value={f.contactValue} onChange={set("contactValue")} /></div>
      </div>
      {needsContactSource && (
        <div className="field"><label htmlFor="bl-csrc">Page where this {f.contactKind === "phone" ? "number" : "address"} is published (https, required)</label>
          <input id="bl-csrc" inputMode="url" value={f.contactSource} onChange={set("contactSource")} /></div>
      )}
      <div className="field"><label htmlFor="bl-notes">Notes</label>
        <textarea id="bl-notes" rows={2} value={f.notes} onChange={set("notes")} /></div>
      {error && <p className="tiny" role="alert">{error}</p>}
      <div className="row">
        <button className="btn grow" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary grow" disabled={busy || !f.name.trim() || !f.source.trim() || (!!needsContactSource && !f.contactSource.trim())}
          onClick={() => void save()}>Save lead</button>
      </div>
    </div>
  );
}
