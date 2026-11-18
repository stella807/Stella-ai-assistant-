import { useState } from "react";
import type { BizDraft, DraftTemplate, LeadStatus } from "@safehubby/core";
import { api, type BizDesk } from "../api.ts";
import { checkRange, mailtoFor, scorePartLabel, type BizLeadView } from "../app/bizdev-view.ts";
import { safeHttpUrl } from "../app/safe-url.ts";

const STATUS_LABEL: Record<LeadStatus, string> = {
  discovered: "Found", qualified: "Qualified", drafted: "Message drafted", approved: "Message approved", sent: "Message sent",
  replied: "Replied", meeting: "Meeting set", won: "Won", rejected: "Turned down",
};
export const leadStatusLabel = (s: LeadStatus) => STATUS_LABEL[s];

const DRAFT_LABEL: Record<BizDraft["status"], string> = { draft: "Waiting for your OK", approved: "Approved", rejected: "Not using", sent: "Sent" };

/** One lead, opened: why it scored what it did, where each fact came from, and its messages. */
export function BizLeadCard({ lead, drafts, desk, onLead, onDraft, onRemoved }: {
  lead: BizLeadView; drafts: BizDraft[]; desk: BizDesk;
  onLead: (lead: BizLeadView) => void; onDraft: (draft: BizDraft) => void; onRemoved: () => void;
}) {
  const { meta, settings } = desk;
  const [template, setTemplate] = useState<DraftTemplate>(lead.kind === "investor" ? (lead.investorType === "family-office" ? "family-office" : lead.investorType === "fleet-financing" ? "fleet-financing" : "investor") : "strategic-partner");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ subject: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work"); }
  };

  // Mirrors needsSecuritiesReview in core: anything to an investor is held, whatever the template.
  const capital = (t: DraftTemplate) => lead.kind === "investor" || meta.capitalTemplates.includes(t);
  const ch = lead.contactChannel;
  const contactHref = ch?.kind === "form" || ch?.kind === "linkedin" ? safeHttpUrl(ch.value) : undefined;

  const copy = async (d: BizDraft) => {
    try {
      await navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`);
      setCopied(d.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy. Select the text and copy it by hand.");
    }
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      {lead.suppressed && <p className="tiny" role="status"><strong>Opted out.</strong> This contact is on the do-not-contact list.</p>}

      <div className="card card-quiet stack" style={{ gap: 4 }}>
        <strong className="small">Score {lead.score.total} / 100{lead.score.qualified ? " · qualified" : ""}</strong>
        {Object.entries(lead.score.parts).map(([k, v]) => (
          <span key={k} className="tiny muted">{scorePartLabel(k)}: {v}</span>
        ))}
        {lead.score.flags.map((f) => <span key={f} className="tiny">⚠ {f}</span>)}
        {lead.lists.length > 0 && (
          <span className="tiny">Lists: {lead.lists.map((l) => `${l} (${meta.listLabels[l]})`).join(" · ")}</span>
        )}
      </div>

      {lead.kind === "investor" && (
        <p className="tiny" style={{ margin: 0 }}>
          Typical check: {checkRange(lead.typicalCheckUsd)}
          {lead.lastInvestmentOn ? ` · Latest investment: ${lead.lastInvestmentOn}` : ""}
        </p>
      )}
      {lead.connection && <p className="small" style={{ margin: 0 }}>{lead.connection}</p>}

      {lead.evidence.length > 0 && (
        <ul className="tiny" style={{ margin: 0, paddingLeft: 18 }}>
          {lead.evidence.map((e, i) => (
            <li key={i}>{e.claim} {safeHttpUrl(e.url) && <a href={safeHttpUrl(e.url)} target="_blank" rel="noopener noreferrer">source ↗</a>}</li>
          ))}
        </ul>
      )}
      <div className="row tiny" style={{ gap: 12, flexWrap: "wrap" }}>
        {safeHttpUrl(lead.website) && <a href={safeHttpUrl(lead.website)} target="_blank" rel="noopener noreferrer">Website ↗</a>}
        {lead.sources.map((s, i) => safeHttpUrl(s) && <a key={s} href={safeHttpUrl(s)} target="_blank" rel="noopener noreferrer">Source {i + 1} ↗</a>)}
      </div>

      {ch && (
        <p className="tiny" style={{ margin: 0 }}>
          Contact{lead.contactName ? ` (${lead.contactName})` : ""}: {contactHref ? <a href={contactHref} target="_blank" rel="noopener noreferrer">{ch.kind === "form" ? "contact form ↗" : "profile ↗"}</a> : ch.value}
          {safeHttpUrl(ch.source) && <> · <a href={safeHttpUrl(ch.source)} target="_blank" rel="noopener noreferrer">where it is published ↗</a></>}
        </p>
      )}

      <div className="field">
        <label htmlFor={`bs-${lead.id}`}>Status</label>
        <select id={`bs-${lead.id}`} value={lead.status}
          onChange={(e) => void run(async () => onLead((await api.bizUpdateLead(lead.id, { status: e.target.value })).lead))}>
          {meta.statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`bn-${lead.id}`}>Your notes</label>
        <textarea id={`bn-${lead.id}`} rows={2} defaultValue={lead.notes}
          onBlur={(e) => { if (e.target.value !== lead.notes) void run(async () => onLead((await api.bizUpdateLead(lead.id, { notes: e.target.value })).lead)); }} />
      </div>

      <h4 className="small" style={{ margin: "6px 0 0" }}>Messages</h4>
      {drafts.length === 0 && <p className="tiny muted" style={{ margin: 0 }}>No messages yet.</p>}
      {drafts.map((d) => (
        <div key={d.id} className="card card-quiet stack" style={{ gap: 6 }}>
          <div className="row-between">
            <strong className="tiny">{d.followUp ? `Follow-up ${d.followUp}` : "First message"} · {meta.templates.find((t) => t.id === d.template)?.label}</strong>
            <span className={`pill${d.status === "sent" ? " pill-safe" : ""}`}>{DRAFT_LABEL[d.status]}</span>
          </div>
          {editing === d.id ? (
            <>
              <div className="field"><label htmlFor={`ds-${d.id}`}>Subject</label>
                <input id={`ds-${d.id}`} value={edit.subject} maxLength={200} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></div>
              <div className="field"><label htmlFor={`db-${d.id}`}>Message</label>
                <textarea id={`db-${d.id}`} rows={12} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></div>
              <div className="row">
                <button className="btn grow" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn-primary grow" disabled={!edit.subject.trim() || !edit.body.trim()}
                  onClick={() => void run(async () => { onDraft((await api.bizDraftAction(d.id, edit)).draft); setEditing(null); })}>Save</button>
              </div>
            </>
          ) : (
            <>
              <p className="tiny" style={{ margin: 0 }}><strong>{d.subject}</strong></p>
              <p className="tiny" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{d.body}</p>
            </>
          )}
          {d.status !== "sent" && editing !== d.id && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {d.status !== "approved" && <button className="btn btn-sm btn-primary" onClick={() => void run(async () => { const r = await api.bizDraftAction(d.id, "approve"); onDraft(r.draft); onLead(r.lead); })}>Approve</button>}
              <button className="btn btn-sm" onClick={() => { setEdit({ subject: d.subject, body: d.body }); setEditing(d.id); }}>Edit</button>
              {d.status !== "rejected" && <button className="btn btn-sm btn-ghost" onClick={() => void run(async () => onDraft((await api.bizDraftAction(d.id, "reject")).draft))}>Don't use</button>}
            </div>
          )}
          {d.status === "approved" && (
            <div className="stack" style={{ gap: 6 }}>
              {capital(d.template) && !settings.securitiesReviewed && (
                <p className="tiny" style={{ margin: 0 }}>
                  Held back: messages to investors can be recorded as sent only after a securities lawyer has reviewed how you approach
                  investors. Turn that on in Settings below once they have.
                </p>
              )}
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-sm" onClick={() => void copy(d)}>{copied === d.id ? "Copied" : "Copy message"}</button>
                {mailtoFor(lead, d) && !lead.suppressed && (!capital(d.template) || settings.securitiesReviewed) && (
                  <a className="btn btn-sm" href={mailtoFor(lead, d)}>Open in my email</a>
                )}
                {(!capital(d.template) || settings.securitiesReviewed) && <button className="btn btn-sm btn-primary" onClick={() => void run(async () => {
                  const r = await api.bizMarkSent(d.id);
                  onDraft(r.draft);
                  onLead(r.lead);
                })}>I sent it</button>}
              </div>
            </div>
          )}
          {d.sentAt && <span className="tiny muted">Sent {new Date(d.sentAt).toLocaleDateString()}</span>}
        </div>
      ))}

      {!lead.suppressed && lead.status !== "rejected" && (
        <div className="row" style={{ gap: 6, alignItems: "flex-end" }}>
          <div className="field grow">
            <label htmlFor={`bt-${lead.id}`}>Draft a {drafts.some((d) => d.status === "sent") ? "follow-up" : "message"}</label>
            <select id={`bt-${lead.id}`} value={template} onChange={(e) => setTemplate(e.target.value as DraftTemplate)}>
              {meta.templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <button className="btn" onClick={() => void run(async () => {
            const r = await api.bizDraft(lead.id, template);
            onDraft(r.draft);
            onLead(r.lead);
          })}>Draft</button>
        </div>
      )}
      <p className="tiny muted" style={{ margin: 0 }}>Drafts are written from this lead's facts only. Nothing is sent for you: you send it yourself, then tap "I sent it".</p>

      {error && <p className="tiny" role="alert">{error}</p>}
      {!drafts.some((d) => d.status === "sent") && (
        <button className="btn btn-sm btn-ghost" onClick={() => void run(async () => { await api.bizDeleteLead(lead.id); onRemoved(); })}>Remove this lead</button>
      )}
    </div>
  );
}
