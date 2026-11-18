import { useEffect, useMemo, useState } from "react";
import type { BizDraft, BizMarket, InvestorList, LeadKind } from "@safehubby/core";
import { api, type BizDesk } from "../api.ts";
import { filterLeads, shortUsd, type BizLeadView } from "../app/bizdev-view.ts";
import { BizDevSettings } from "./BizDevSettings.tsx";
import { BizLeadCard, leadStatusLabel } from "./BizLeadCard.tsx";
import { BizLeadForm } from "./BizLeadForm.tsx";

const KIND_LABEL: Record<LeadKind, string> = { investor: "Investors", customer: "Customers", partner: "Partners" };

/**
 * The owner's business-development desk: investors first, then customers and partners. It keeps the
 * research, scores it from sourced facts, drafts messages and records what the owner sent. It never
 * sends anything itself, and it never counts a lead as money raised.
 */
export function BizDevSection() {
  const [desk, setDesk] = useState<BizDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<LeadKind>("investor");
  const [market, setMarket] = useState<BizMarket | "all">("all");
  const [list, setList] = useState<InvestorList | "all">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = () => api.bizDesk().then(setDesk).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => (desk ? filterLeads(desk.leads, { kind, market, list, query }) : []), [desk, kind, market, list, query]);

  if (!desk) return error ? <p className="tiny" role="alert">{error}</p> : <p className="tiny muted">Loading…</p>;

  const putLead = (lead: BizLeadView) => setDesk((d) => d && ({ ...d, leads: d.leads.some((l) => l.id === lead.id) ? d.leads.map((l) => (l.id === lead.id ? lead : l)) : [...d.leads, lead] }));
  const putDraft = (draft: BizDraft) => setDesk((d) => d && ({ ...d, drafts: d.drafts.some((x) => x.id === draft.id) ? d.drafts.map((x) => (x.id === draft.id ? draft : x)) : [...d.drafts, draft] }));
  const { stats, meta } = desk;
  const marketLabel = (m: BizMarket) => meta.markets.find((x) => x.id === m)?.label ?? m;

  return (
    <section className="card stack" aria-label="Business development">
      <h3 style={{ margin: 0 }}>Business development</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Research, scores and drafts only. Safehubby is pre-revenue and nothing here is sent for you. A lead is not an investor,
        and no money is raised until there is a signed agreement.
      </p>

      <div className="vendor-counts">
        <span className="vendor-count"><strong>{stats.qualifiedInvestors}</strong> qualified investor{stats.qualifiedInvestors === 1 ? "" : "s"}</span>
        <span className="vendor-count" title={stats.fundingNote}><strong>{shortUsd(stats.documentedFundingUsd)}</strong> in documented check sizes</span>
        <span className="vendor-count"><strong>{stats.draftsAwaitingApproval}</strong> draft{stats.draftsAwaitingApproval === 1 ? "" : "s"} to review</span>
        <span className="vendor-count"><strong>{stats.messagesSent}</strong> sent</span>
        <span className="vendor-count"><strong>{stats.replies}</strong> replied</span>
        <span className="vendor-count is-booked"><strong>{stats.meetings}</strong> meeting{stats.meetings === 1 ? "" : "s"}</span>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>{stats.fundingNote} Goal in the proposal: {shortUsd(desk.settings.askUsd)}.</p>

      <div className="master-tabs" role="tablist" aria-label="Kind of lead">
        {meta.kinds.map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} style={{ whiteSpace: "nowrap", fontSize: 13 }}
            onClick={() => { setKind(k); setList("all"); setOpen(null); setAdding(false); }}>
            {KIND_LABEL[k]} ({stats.byKind[k]})
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <div className="field grow">
          <label htmlFor="bz-market">Market</label>
          <select id="bz-market" value={market} onChange={(e) => setMarket(e.target.value as BizMarket | "all")}>
            <option value="all">All markets</option>
            {meta.markets.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        {kind === "investor" && (
          <div className="field grow">
            <label htmlFor="bz-list">List</label>
            <select id="bz-list" value={list} onChange={(e) => setList(e.target.value as InvestorList | "all")}>
              <option value="all">All lists</option>
              {(Object.keys(meta.listLabels) as InvestorList[]).map((l) => <option key={l} value={l}>{l}: {meta.listLabels[l]}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="bz-search">Search</label>
        <input id="bz-search" type="search" placeholder="Name, company, city or interest" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {shown.length === 0 && !adding && (
        <p className="tiny muted" style={{ margin: 0 }}>
          No {KIND_LABEL[kind].toLowerCase()} {market !== "all" || list !== "all" || query ? "match these filters" : "yet"}. Add the first one below.
        </p>
      )}

      {shown.map((l) => (
        <div key={l.id} className={`vendor-row stack${open === l.id ? " is-open" : ""}`} style={{ gap: 6 }}>
          <button className="vendor-head" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
            <span className="vendor-name">
              <strong>{l.name}</strong>
              <span className="tiny muted">{[l.org, marketLabel(l.market), leadStatusLabel(l.status)].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={`pill${l.score.qualified ? " pill-safe" : ""}`} aria-label={`Score ${l.score.total} out of 100`}>{l.score.total}</span>
          </button>
          {open === l.id && (
            <BizLeadCard lead={l} desk={desk} drafts={desk.drafts.filter((d) => d.leadId === l.id)}
              onLead={putLead} onDraft={putDraft}
              onRemoved={() => { setDesk((d) => d && ({ ...d, leads: d.leads.filter((x) => x.id !== l.id), drafts: d.drafts.filter((x) => x.leadId !== l.id) })); setOpen(null); }} />
          )}
        </div>
      ))}

      {adding ? (
        <BizLeadForm kind={kind} meta={meta} onCancel={() => setAdding(false)}
          onAdded={(lead) => { putLead(lead); setAdding(false); setOpen(lead.id); }} />
      ) : (
        <button className="btn btn-block" onClick={() => setAdding(true)}>Add {kind === "investor" ? "an investor" : `a ${kind}`}</button>
      )}

      <BizDevSettings settings={desk.settings} suppressions={desk.suppressions} audit={desk.audit}
        onSettings={() => void load()} onSuppressions={() => void load()} />
      {error && <p className="tiny" role="alert">{error}</p>}
    </section>
  );
}
