import { SUGGESTED_VENDORS, VENDOR_CATEGORIES, type VendorCategory } from "./vendors.ts";

/**
 * The paid vendor lookup other AI agents can buy (x402). It searches only Safehubby's published research
 * (SUGGESTED_VENDORS), never the owner's own vendor records: those hold who the owner spoke to, quotes and
 * private notes. A phone or email is included only where the research found the business publishing it.
 */
export interface AgentVendorResult {
  name: string; category: string; area: string; offers: string; website?: string; phone?: string; email?: string; notes: string;
}

export interface AgentVendorQuery { q?: string; category?: string; place?: string; limit?: number }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function lookupVendorsForAgents(query: AgentVendorQuery): { results: AgentVendorResult[]; total: number } {
  const words = norm(String(query.q ?? "").slice(0, 200)).split(/\s+/).filter(Boolean);
  const place = norm(String(query.place ?? "").slice(0, 100));
  const category = VENDOR_CATEGORIES.some((c) => c.id === query.category) ? (query.category as VendorCategory) : undefined;
  const limit = Math.min(25, Math.max(1, Math.floor(Number(query.limit) || 10)));
  const label = (id: string) => VENDOR_CATEGORIES.find((c) => c.id === id)?.label ?? id;
  const hits = SUGGESTED_VENDORS.filter((v) => {
    if (category && v.category !== category) return false;
    if (place && !norm(v.area).includes(place)) return false;
    const hay = norm(`${v.name} ${v.area} ${v.offers} ${label(v.category)}`);
    return words.every((w) => hay.includes(w));
  });
  return {
    total: hits.length,
    results: hits.slice(0, limit).map((v) => ({
      name: v.name, category: label(v.category), area: v.area, offers: v.offers, website: v.sourceUrl,
      ...(v.phone ? { phone: v.phone } : {}), ...(v.email ? { email: v.email } : {}), notes: v.notes,
    })),
  };
}

export const AGENT_VENDOR_CATEGORIES = VENDOR_CATEGORIES.map((c) => c.id);
