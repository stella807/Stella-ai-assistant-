/**
 * The business-development desk: investors, customers and partners the owner works through, and the
 * messages prepared for them. Everything here is deterministic, so a score or a "may this be sent"
 * answer never depends on what a language model said.
 *
 * Rules the rest of the system relies on:
 *  - A fact counts only with an https page behind it. Evidence without one adds nothing to a score.
 *  - An email address is stored only with the page it was read on. None is ever guessed.
 *  - A fund's size is not the cheque it writes. Only a documented cheque size is scored.
 *  - A drafted message is never sent by this module. It can only be marked sent after the owner
 *    approved it, and investor messages stay blocked until the owner records that counsel has
 *    reviewed how Safehubby approaches investors.
 */

export type BizMarket = "puerto-rico" | "texas" | "los-angeles" | "florida" | "us" | "international";
export const BIZ_MARKETS: { id: BizMarket; label: string }[] = [
  { id: "puerto-rico", label: "Puerto Rico" },
  { id: "texas", label: "Texas" },
  { id: "los-angeles", label: "Los Angeles" },
  { id: "florida", label: "Florida" },
  { id: "us", label: "United States (other)" },
  { id: "international", label: "International" },
];

export type LeadKind = "investor" | "customer" | "partner";
export const LEAD_KINDS: LeadKind[] = ["investor", "customer", "partner"];

export type InvestorType =
  | "angel" | "high-net-worth" | "family-office" | "private-equity" | "venture-capital" | "strategic-transport"
  | "strategic-hospitality" | "strategic-security" | "fleet-financing" | "investment-group" | "corporate-venture" | "other";
export const INVESTOR_TYPES: { id: InvestorType; label: string }[] = [
  { id: "angel", label: "Angel investor" },
  { id: "high-net-worth", label: "High-net-worth individual" },
  { id: "family-office", label: "Family office" },
  { id: "private-equity", label: "Private equity" },
  { id: "venture-capital", label: "Venture capital" },
  { id: "strategic-transport", label: "Strategic: transportation" },
  { id: "strategic-hospitality", label: "Strategic: hospitality" },
  { id: "strategic-security", label: "Strategic: security" },
  { id: "fleet-financing", label: "Fleet financing" },
  { id: "investment-group", label: "Private investment group" },
  { id: "corporate-venture", label: "Corporate investment arm" },
  { id: "other", label: "Other" },
];

export type EvidenceTag =
  | "transportation" | "hospitality" | "security" | "concierge" | "consumer-services" | "travel" | "fleet"
  | "marketing" | "introductions" | "puerto-rico";

/** One fact about a lead, with the page it came from. */
export interface Evidence { claim: string; url: string; tag?: EvidenceTag; comparable?: boolean }

export type ContactKind = "email" | "phone" | "form" | "linkedin" | "other";
export interface ContactChannel { kind: ContactKind; value: string; /** The page it was read on. Required for an email or a phone number. */ source?: string }

export type LeadStatus = "discovered" | "qualified" | "drafted" | "approved" | "sent" | "replied" | "meeting" | "won" | "rejected";
export const LEAD_STATUSES: LeadStatus[] = ["discovered", "qualified", "drafted", "approved", "sent", "replied", "meeting", "won", "rejected"];

export interface BizLead {
  id: string;
  kind: LeadKind;
  name: string;
  org?: string;
  website?: string;
  profileUrl?: string;
  location?: string;
  market: BizMarket;
  investorType?: InvestorType;
  /** For customers and partners: hotel, hospital, fleet leasing, and so on. */
  segment?: string;
  stage?: string;
  interests: string[];
  previousInvestments: string[];
  /** Only what is publicly documented. */
  typicalCheckUsd?: { min?: number; max?: number };
  /** Kept apart from the cheque size on purpose. It is never scored as one. */
  fundSizeUsd?: number;
  lastInvestmentOn?: string;
  evidence: Evidence[];
  contactName?: string;
  contactChannel?: ContactChannel;
  sources: string[];
  /** Why this lead could matter to Safehubby, in the owner's or the agent's words. */
  connection?: string;
  status: LeadStatus;
  notes: string;
  lastVerifiedOn?: string;
  createdAt: string;
  updatedAt: string;
}

export type DraftTemplate = "investor" | "family-office" | "fleet-financing" | "hotel" | "corporate" | "security-partner" | "strategic-partner";
export const DRAFT_TEMPLATES: { id: DraftTemplate; label: string }[] = [
  { id: "investor", label: "Investor" },
  { id: "family-office", label: "Family office" },
  { id: "fleet-financing", label: "Fleet financing" },
  { id: "hotel", label: "Hotel or resort" },
  { id: "corporate", label: "Corporate customer" },
  { id: "security-partner", label: "Security partner" },
  { id: "strategic-partner", label: "Strategic partner" },
];
/** Templates that raise money, so securities rules apply to them. */
export const CAPITAL_TEMPLATES: DraftTemplate[] = ["investor", "family-office", "fleet-financing"];

export type DraftStatus = "draft" | "approved" | "rejected" | "sent";
export interface BizDraft {
  id: string;
  leadId: string;
  template: DraftTemplate;
  subject: string;
  body: string;
  status: DraftStatus;
  /** 0 for the first message, 1 and 2 for follow-ups. */
  followUp: number;
  createdAt: string;
  approvedAt?: string;
  sentAt?: string;
}

export interface BizSuppression { id?: string; value: string; reason?: string; at?: string }

export interface BizAuditEntry { id: string; at: string; actor: "owner" | "agent"; action: string; subjectId?: string; detail: string }

export interface BizSettings {
  /** The full proposal, from the owner. */
  askUsd: number;
  /** What a smaller first launch in Puerto Rico could be funded with. An assumption the owner sets. */
  launchMinUsd: number;
  launchMaxUsd: number;
  /** The owner's record that counsel has reviewed how investors may be approached. Investor messages stay blocked until true. */
  securitiesReviewed: boolean;
  minDaysBetween: number;
  maxFollowUps: number;
}
export const DEFAULT_BIZ_SETTINGS: BizSettings = {
  askUsd: 3_800_000, launchMinUsd: 100_000, launchMaxUsd: 1_000_000, securitiesReviewed: false, minDaysBetween: 5, maxFollowUps: 2,
};

const INDUSTRY_TAGS: EvidenceTag[] = ["transportation", "hospitality", "security", "concierge", "consumer-services", "travel", "fleet"];
const COMPARABLE_TAGS: EvidenceTag[] = ["concierge", "hospitality", "security", "transportation", "fleet"];
const QUALIFIED_AT = 60;
const DAY_MS = 86_400_000;
const MONTH_MS = 30.4 * DAY_MS;

const isHttps = (u: unknown): u is string => typeof u === "string" && /^https:\/\/[^\s/]+/.test(u.trim());
const validEvidence = (l: BizLead): Evidence[] => (l.evidence ?? []).filter((e) => e.claim?.trim() && isHttps(e.url));
const emailOf = (l: BizLead): string | undefined => (l.contactChannel?.kind === "email" ? l.contactChannel.value.trim().toLowerCase() : undefined);

export interface LeadScore { total: number; parts: Record<string, number>; flags: string[]; qualified: boolean }

const GEO: Record<BizMarket, number> = { "puerto-rico": 15, texas: 12, "los-angeles": 12, florida: 12, us: 8, international: 4 };

export function scoreLead(lead: BizLead, now: Date, settings: BizSettings = DEFAULT_BIZ_SETTINGS): LeadScore {
  const evidence = validEvidence(lead);
  const flags: string[] = [];
  if (evidence.length === 0) flags.push("No sourced evidence yet: add a page that shows why this lead fits.");

  if (lead.kind !== "investor") {
    // Customers and partners: where they are, documented fit, and a listed way to reach them.
    const geography = Math.round((GEO[lead.market] / 15) * 30);
    const fit = Math.min(40, Math.min(2, evidence.length) * 20);
    const ch = lead.contactChannel;
    const reachable = !!ch && (ch.kind === "form" || ch.kind === "linkedin" || ch.kind === "other" ? isHttps(ch.value) : isHttps(ch.source));
    const contact = reachable ? 20 : 0;
    const decisionMaker = lead.contactName?.trim() && reachable ? 10 : 0;
    if (!reachable) flags.push("No publicly listed way to reach them, with its source page.");
    const parts = { geography, fit, contact, decisionMaker };
    const total = geography + fit + contact + decisionMaker;
    return { total, parts, flags, qualified: total >= QUALIFIED_AT && evidence.length > 0 };
  }

  const tags = new Set(evidence.map((e) => e.tag).filter((t): t is EvidenceTag => !!t && INDUSTRY_TAGS.includes(t)));
  const industry = tags.size >= 3 ? 30 : tags.size === 2 ? 20 : tags.size === 1 ? 12 : 0;

  let size: number;
  const check = lead.typicalCheckUsd;
  if (!check || (check.min === undefined && check.max === undefined)) {
    size = 4;
    flags.push("Typical check size is not documented.");
    if (lead.fundSizeUsd) flags.push("Fund size is not a check size, so it was not scored as one.");
  } else {
    const lo = check.min ?? 0;
    const hi = check.max ?? check.min ?? 0;
    if (hi >= settings.askUsd) size = 20;
    else if (hi >= settings.launchMinUsd && lo <= settings.launchMaxUsd) size = 16;
    else if (hi < settings.launchMinUsd) size = Math.max(1, Math.round((hi / settings.launchMinUsd) * 8));
    else size = 2; // writes only cheques larger than a smaller launch needs, and smaller than the whole ask
    if (lo > settings.askUsd) size = 2;
  }

  const geography = GEO[lead.market];

  let activity = 0;
  const last = lead.lastInvestmentOn ? new Date(lead.lastInvestmentOn).getTime() : NaN;
  if (Number.isNaN(last)) flags.push("No dated investment on record, so activity is not scored.");
  else {
    const months = (now.getTime() - last) / MONTH_MS;
    activity = months <= 24 ? 15 : months <= 48 ? 8 : 2;
  }

  const strategicTypes: InvestorType[] = ["strategic-transport", "strategic-hospitality", "strategic-security", "fleet-financing"];
  const strategic = lead.investorType && strategicTypes.includes(lead.investorType) ? 10
    : lead.investorType === "corporate-venture" ? 7
    : evidence.some((e) => e.tag === "introductions") ? 6 : 0;

  const comparableCount = evidence.filter((e) => e.comparable && (!e.tag || COMPARABLE_TAGS.includes(e.tag))).length;
  const comparable = comparableCount >= 2 ? 10 : comparableCount === 1 ? 6 : 0;

  const parts = { industry, size, geography, activity, strategic, comparable };
  const total = industry + size + geography + activity + strategic + comparable;
  return { total, parts, flags, qualified: total >= QUALIFIED_AT && evidence.length > 0 };
}

export type InvestorList = "A" | "B" | "C" | "D" | "E" | "F";
export const INVESTOR_LIST_LABELS: Record<InvestorList, string> = {
  A: "Could fund the whole proposal",
  B: "Could fund a smaller Puerto Rico launch",
  C: "Vehicles and fleet financing",
  D: "Marketing and customer acquisition",
  E: "Strategic partner (not only cash)",
  F: "Could introduce other investors",
};

/** Which of the six investor lists a lead belongs on, from documented facts only. */
export function investorLists(lead: BizLead, _now: Date, settings: BizSettings = DEFAULT_BIZ_SETTINGS): InvestorList[] {
  if (lead.kind !== "investor") return [];
  const out: InvestorList[] = [];
  const ev = validEvidence(lead);
  const check = lead.typicalCheckUsd;
  const hi = check?.max ?? check?.min;
  const lo = check?.min ?? 0;
  if (hi !== undefined && hi >= settings.askUsd) out.push("A");
  if (hi !== undefined && hi >= settings.launchMinUsd && lo <= settings.launchMaxUsd && lead.market === "puerto-rico") out.push("B");
  if (lead.investorType === "fleet-financing" || ev.some((e) => e.tag === "fleet")) out.push("C");
  if (ev.some((e) => e.tag === "marketing")) out.push("D");
  if (lead.investorType === "strategic-transport" || lead.investorType === "strategic-hospitality" || lead.investorType === "strategic-security") out.push("E");
  if (ev.some((e) => e.tag === "introductions")) out.push("F");
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Problems with a lead the owner or the agent is about to save. Empty means it can be saved. */
export function validateLead(input: unknown): string[] {
  const l = (input ?? {}) as Record<string, any>;
  const errors: string[] = [];
  if (!String(l.name ?? "").trim()) errors.push("A lead needs a name.");
  if (!LEAD_KINDS.includes(l.kind)) errors.push("Pick a kind: investor, customer or partner.");
  if (l.kind === "investor" && !INVESTOR_TYPES.some((t) => t.id === l.investorType)) errors.push("An investor needs an investor type.");
  if (!BIZ_MARKETS.some((m) => m.id === l.market)) errors.push("Pick a market.");
  const sources: unknown[] = Array.isArray(l.sources) ? l.sources : [];
  if (sources.length === 0) errors.push("Add at least one source page for this lead.");
  else if (!sources.every(isHttps)) errors.push("Every source must be an https page.");
  for (const e of Array.isArray(l.evidence) ? l.evidence : []) {
    if (!isHttps(e?.url)) errors.push("Every piece of evidence needs an https source page.");
    else if (!String(e?.claim ?? "").trim()) errors.push("Every piece of evidence needs a sentence saying what the page shows.");
  }
  for (const k of ["website", "profileUrl"] as const) if (l[k] && !isHttps(l[k])) errors.push(`The ${k === "website" ? "website" : "profile link"} must be an https address.`);
  if (l.status !== undefined && !LEAD_STATUSES.includes(l.status)) errors.push("That is not a status.");
  const c = l.contactChannel;
  if (c) {
    if (c.kind === "email" && !EMAIL_RE.test(String(c.value ?? "").trim())) errors.push("That email address is not valid.");
    if ((c.kind === "email" || c.kind === "phone") && !isHttps(c.source)) errors.push("An email or phone number needs the source page it was read on.");
    if ((c.kind === "form" || c.kind === "linkedin") && !isHttps(c.value)) errors.push("A form or profile contact must be an https address.");
  }
  const t = l.typicalCheckUsd;
  if (t && t.min !== undefined && t.max !== undefined && Number(t.min) > Number(t.max)) errors.push("The check size runs backwards: the minimum is above the maximum.");
  return errors;
}

/* ---- drafts ---------------------------------------------------------------------------------- */

const SIGN = "The founder, Safehubby\ncontact@safehubby.com";
const STOP = 'If this isn\'t relevant, reply "no" and I won\'t write again.';
const NOT_OFFER = "This message is not an offer to sell securities or a solicitation to buy them. Any investment would be offered only through proper documents, after legal review.";


/** A message built only from what the lead record says. It leaves out whatever is unknown. */
export function draftFor(lead: BizLead, template: DraftTemplate, _now: Date): { template: DraftTemplate; subject: string; body: string } {
  const ev = validEvidence(lead)[0];
  const who = `Hello ${lead.name.trim()},`;
  const noticed = ev ? `I came across your work because of this: ${ev.claim} (${ev.url}).\n\n` : "";
  const place = lead.org ? ` at ${lead.org}` : "";

  const about =
    "Safehubby is a concierge and personal-assistant service launching in Puerto Rico, with Texas and Los Angeles planned next. " +
    "Members get assistants for errands, hospital-day companions, secure transportation and a night-out safety line. " +
    "We are pre-launch and have no revenue yet.";

  const bodies: Record<DraftTemplate, { subject: string; body: string }> = {
    investor: {
      subject: "Safehubby: a Puerto Rico concierge and safety service",
      body: `${who}\n\n${noticed}I'm the founder of Safehubby. ${about}\n\nI'm looking for a short call${place ? ` with you${place}` : ""} to hear whether this fits what you look at, and to answer questions. I can send a short summary first if you prefer.\n\n${NOT_OFFER}\n\n${STOP}\n\n${SIGN}`,
    },
    "family-office": {
      subject: "Safehubby: a Puerto Rico concierge service, a short introduction",
      body: `${who}\n\n${noticed}I'm the founder of Safehubby. ${about}\n\nIf a first conversation would be useful, I can walk through the plan and what we still need to prove. I'm happy to start with a written summary.\n\n${NOT_OFFER}\n\n${STOP}\n\n${SIGN}`,
    },
    "fleet-financing": {
      subject: "Safehubby: vehicle leasing or financing for a Puerto Rico launch",
      body: `${who}\n\n${noticed}I'm the founder of Safehubby. ${about}\n\nWe plan to offer secure transportation and would like to learn whether leasing, financing or a partner-operated arrangement could let us start with fewer vehicles. Could you tell me what you would need to see, and who to speak to?\n\nNothing here is an offer of securities or a commitment by either side.\n\n${STOP}\n\n${SIGN}`,
    },
    hotel: {
      subject: "Concierge help for your guests in Puerto Rico",
      body: `${who}\n\n${noticed}I'm the founder of Safehubby, a concierge and personal-assistant service in Puerto Rico. We can help hotel guests with errands, hospital visits for relatives, and a safe ride home. We are just starting, so I would like to learn what your guests ask for most before suggesting anything.\n\nWould a short call be useful?\n\n${STOP}\n\n${SIGN}`,
    },
    corporate: {
      subject: "Assistants and local help for your team in Puerto Rico",
      body: `${who}\n\n${noticed}I'm the founder of Safehubby, a concierge and personal-assistant service in Puerto Rico. We offer assistants for errands and appointments, hospital-day companions and secure transportation. I'd like to hear how your team handles this today and whether a monthly arrangement could help.\n\n${STOP}\n\n${SIGN}`,
    },
    "security-partner": {
      subject: "A licensed security partner for Safehubby in Puerto Rico",
      body: `${who}\n\n${noticed}I'm the founder of Safehubby. ${about}\n\nWe do not provide security services ourselves. We are looking for a licensed company that could do so for members who ask for it, under its own license and insurance. Could we talk about how that would work?\n\n${STOP}\n\n${SIGN}`,
    },
    "strategic-partner": {
      subject: "Working together: Safehubby in Puerto Rico",
      body: `${who}\n\n${noticed}I'm the founder of Safehubby. ${about}\n\nI think there may be a way for us to help each other's customers. Could we have a short call to see whether it makes sense?\n\n${STOP}\n\n${SIGN}`,
    },
  };
  return { template, ...bodies[template] };
}

/* ---- sending rules --------------------------------------------------------------------------- */

const norm = (s: string) => s.trim().toLowerCase().replace(/^@/, "");
const hostOf = (url?: string): string | undefined => { try { return url ? new URL(url).hostname.replace(/^www\./, "").toLowerCase() : undefined; } catch { return undefined; } };

/** Whether the lead's address or domain is on the opt-out list, however the entry was typed. */
export function isSuppressed(lead: BizLead, list: { value: string }[]): boolean {
  const email = emailOf(lead);
  const domains = new Set([email?.split("@")[1], hostOf(lead.website)].filter((d): d is string => !!d));
  return list.some((s) => {
    const v = norm(s.value);
    if (!v) return false;
    return v.includes("@") ? v === email : domains.has(v);
  });
}

/** Whether the owner may record a draft as sent. Nothing here sends anything. */
export function canMarkSent(
  draft: BizDraft, lead: BizLead, settings: BizSettings, suppressions: { value: string }[], prior: BizDraft[], now: Date,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (draft.status !== "approved") reasons.push("The owner has not approved this message.");
  if (lead.status === "rejected") reasons.push("This lead was turned down.");
  if (isSuppressed(lead, suppressions)) reasons.push("This contact has opted out (suppression list).");
  if (CAPITAL_TEMPLATES.includes(draft.template) && !settings.securitiesReviewed) {
    reasons.push("Investor messages stay blocked until counsel has reviewed how Safehubby approaches investors (securities rules).");
  }
  const sent = prior.filter((p) => p.leadId === lead.id && p.status === "sent" && p.id !== draft.id);
  if (sent.length >= settings.maxFollowUps + 1) reasons.push(`Already sent the first message and ${settings.maxFollowUps} follow-ups.`);
  const lastAt = Math.max(0, ...sent.map((p) => (p.sentAt ? new Date(p.sentAt).getTime() : 0)));
  if (lastAt) {
    const wait = Math.ceil(settings.minDaysBetween - (now.getTime() - lastAt) / DAY_MS);
    if (wait > 0) reasons.push(`Wait ${wait} more days since the last message.`);
  }
  return { ok: reasons.length === 0, reasons };
}

/* ---- summary --------------------------------------------------------------------------------- */

export interface BizStats {
  byKind: Record<LeadKind, number>;
  byStatus: Partial<Record<LeadStatus, number>>;
  qualifiedInvestors: number;
  documentedFundingUsd: number;
  fundingNote: string;
  draftsAwaitingApproval: number;
  messagesSent: number;
  replies: number;
  meetings: number;
}

export function bizStats(leads: BizLead[], drafts: BizDraft[], now: Date, settings: BizSettings = DEFAULT_BIZ_SETTINGS): BizStats {
  const byKind: Record<LeadKind, number> = { investor: 0, customer: 0, partner: 0 };
  const byStatus: Partial<Record<LeadStatus, number>> = {};
  let qualifiedInvestors = 0;
  let documentedFundingUsd = 0;
  for (const l of leads) {
    byKind[l.kind] += 1;
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    if (l.kind === "investor" && l.status !== "rejected" && scoreLead(l, now, settings).qualified) {
      qualifiedInvestors += 1;
      documentedFundingUsd += l.typicalCheckUsd?.max ?? l.typicalCheckUsd?.min ?? 0;
    }
  }
  return {
    byKind, byStatus, qualifiedInvestors, documentedFundingUsd,
    fundingNote: "Sum of the documented maximum check sizes of qualified investors. These are not commitments.",
    draftsAwaitingApproval: drafts.filter((d) => d.status === "draft").length,
    messagesSent: drafts.filter((d) => d.status === "sent").length,
    replies: byStatus.replied ?? 0,
    meetings: byStatus.meeting ?? 0,
  };
}

/* ---- reading what the portal sends ------------------------------------------------------------ */

const txt = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v: unknown, max: number): string | undefined => txt(v, max) || undefined;
const usd = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[$,\s]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};
const day = (v: unknown): string | undefined => {
  const s = txt(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime()) ? s : undefined;
};
/** A list typed as one line ("a, b") or sent as an array. */
const list = (v: unknown, max: number, each: number): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [];
  return raw.map((x) => txt(x, each)).filter(Boolean).slice(0, max);
};
const EVIDENCE_TAGS: EvidenceTag[] = [...INDUSTRY_TAGS, "marketing", "introductions", "puerto-rico"];
const CONTACT_KINDS: ContactKind[] = ["email", "phone", "form", "linkedin", "other"];

/**
 * The fields of a lead found in an untrusted request body, trimmed and capped. Only the fields the body
 * carries come back, so an edit changes only what was sent. Nothing is checked here beyond shape:
 * `validateLead` on the merged lead decides whether it can be saved.
 */
export function readLeadInput(body: unknown): Partial<BizLead> {
  const b = (body ?? {}) as Record<string, unknown>;
  const has = (k: string) => b[k] !== undefined;
  const out: Partial<BizLead> = {};
  if (has("kind")) out.kind = txt(b.kind, 20) as LeadKind;
  if (has("name")) out.name = txt(b.name, 120);
  if (has("org")) out.org = opt(b.org, 160);
  if (has("website")) out.website = opt(b.website, 400);
  if (has("profileUrl")) out.profileUrl = opt(b.profileUrl, 400);
  if (has("location")) out.location = opt(b.location, 120);
  if (has("market")) out.market = txt(b.market, 20) as BizMarket;
  if (has("investorType")) out.investorType = (opt(b.investorType, 40) as InvestorType | undefined);
  if (has("segment")) out.segment = opt(b.segment, 80);
  if (has("stage")) out.stage = opt(b.stage, 80);
  if (has("interests")) out.interests = list(b.interests, 20, 60);
  if (has("previousInvestments")) out.previousInvestments = list(b.previousInvestments, 30, 160);
  if (has("typicalCheckUsd")) {
    const t = (b.typicalCheckUsd ?? {}) as Record<string, unknown>;
    const min = usd(t.min), max = usd(t.max);
    out.typicalCheckUsd = min === undefined && max === undefined ? undefined : { min, max };
  }
  if (has("fundSizeUsd")) out.fundSizeUsd = usd(b.fundSizeUsd);
  if (has("lastInvestmentOn")) out.lastInvestmentOn = day(b.lastInvestmentOn);
  if (has("lastVerifiedOn")) out.lastVerifiedOn = day(b.lastVerifiedOn);
  if (has("evidence")) {
    out.evidence = (Array.isArray(b.evidence) ? b.evidence : []).slice(0, 20).map((e: any) => ({
      claim: txt(e?.claim, 300), url: txt(e?.url, 400),
      ...(EVIDENCE_TAGS.includes(e?.tag) ? { tag: e.tag as EvidenceTag } : {}),
      ...(e?.comparable === true ? { comparable: true } : {}),
    })).filter((e) => e.claim || e.url);
  }
  if (has("contactName")) out.contactName = opt(b.contactName, 120);
  if (has("contactChannel")) {
    const c = b.contactChannel as Record<string, unknown> | null;
    const kind = txt(c?.kind, 20) as ContactKind;
    const value = txt(c?.value, 200);
    out.contactChannel = c && CONTACT_KINDS.includes(kind) && value ? { kind, value, ...(opt(c.source, 400) ? { source: opt(c.source, 400) } : {}) } : undefined;
  }
  if (has("sources")) out.sources = list(b.sources, 20, 400);
  if (has("connection")) out.connection = opt(b.connection, 600);
  if (has("status")) out.status = txt(b.status, 20) as LeadStatus;
  if (has("notes")) out.notes = txt(b.notes, 2000);
  return out;
}

/** The owner's assumptions, with each kept inside the limits the sending rules were written for. */
export function readBizSettings(body: unknown, current: BizSettings = DEFAULT_BIZ_SETTINGS): BizSettings {
  const b = (body ?? {}) as Record<string, unknown>;
  const n = (k: keyof BizSettings, lo: number, hi: number) => {
    const v = usd(b[k]);
    return v === undefined ? (current[k] as number) : Math.min(hi, Math.max(lo, v));
  };
  const next: BizSettings = {
    askUsd: n("askUsd", 1, 1_000_000_000),
    launchMinUsd: n("launchMinUsd", 0, 1_000_000_000),
    launchMaxUsd: n("launchMaxUsd", 0, 1_000_000_000),
    securitiesReviewed: typeof b.securitiesReviewed === "boolean" ? b.securitiesReviewed : current.securitiesReviewed,
    // Never closer than five days apart and never more than two follow-ups, however the setting is typed.
    minDaysBetween: n("minDaysBetween", 5, 60),
    maxFollowUps: n("maxFollowUps", 0, 2),
  };
  if (next.launchMinUsd > next.launchMaxUsd) next.launchMaxUsd = next.launchMinUsd;
  return next;
}
