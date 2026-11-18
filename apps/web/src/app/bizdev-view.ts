import type { BizDraft, BizLead, BizMarket, InvestorList, LeadKind, LeadScore } from "@safehubby/core";

/** A lead as the owner portal receives it: the score, lists and opt-out flag are worked out by the server. */
export type BizLeadView = BizLead & { score: LeadScore; lists: InvestorList[]; suppressed: boolean };

export type BizFilter = { kind: LeadKind; market: BizMarket | "all"; list: InvestorList | "all"; query: string };

/** The leads to show, best score first, so the owner works from the top. */
export function filterLeads(leads: BizLeadView[], f: BizFilter): BizLeadView[] {
  const q = f.query.trim().toLowerCase();
  return leads
    .filter((l) => l.kind === f.kind
      && (f.market === "all" || l.market === f.market)
      && (f.list === "all" || l.lists.includes(f.list))
      && (!q || `${l.name} ${l.org ?? ""} ${l.location ?? ""} ${l.segment ?? ""} ${l.interests.join(" ")}`.toLowerCase().includes(q)))
    .sort((a, b) => b.score.total - a.score.total || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** "$3.8M", "$250K", "$900": short enough for a phone. */
export function shortUsd(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function checkRange(t: BizLead["typicalCheckUsd"]): string {
  if (!t || (t.min === undefined && t.max === undefined)) return "Not documented";
  if (t.min !== undefined && t.max !== undefined) return `${shortUsd(t.min)} – ${shortUsd(t.max)}`;
  return t.max !== undefined ? `Up to ${shortUsd(t.max)}` : `From ${shortUsd(t.min)}`;
}

/**
 * A link that opens the owner's own email app with the approved message filled in, so the owner sends
 * it themselves. Only for a lead whose contact is an email address read on a public page.
 */
export function mailtoFor(lead: BizLead, draft: Pick<BizDraft, "subject" | "body">): string | undefined {
  const c = lead.contactChannel;
  if (c?.kind !== "email" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value.trim())) return undefined;
  return `mailto:${encodeURIComponent(c.value.trim())}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}

const SCORE_PART_LABEL: Record<string, string> = {
  industry: "Industry fit", size: "Check size", geography: "Where they are", activity: "Invested recently", strategic: "Strategic value",
  comparable: "Backed something like us", fit: "Documented fit", contact: "Public contact", decisionMaker: "Named person",
};
export const scorePartLabel = (k: string) => SCORE_PART_LABEL[k] ?? k;
