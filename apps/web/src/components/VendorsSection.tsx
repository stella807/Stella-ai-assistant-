import { useEffect, useMemo, useState } from "react";
import type { Vendor, VendorCategory, VendorStatus } from "@safehubby/core";
import { api } from "../api.ts";

type Meta = { categories: { id: VendorCategory; label: string }[]; statuses: VendorStatus[] };

const STATUS_LABEL: Record<VendorStatus, string> = {
  lead: "Lead", contacted: "Contacted", quoted: "Quoted", booked: "Booked", declined: "Declined",
};

/**
 * The businesses that could help put on the Wingman Club's events. The
 * research arrives as leads; the owner moves each one along and keeps who
 * they spoke to and what was quoted. Nothing here was confirmed with a
 * business, and the notes say where each price came from.
 */
export function VendorsSection() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filter, setFilter] = useState<VendorCategory | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", category: "event-planner" as VendorCategory, area: "", offers: "", sourceUrl: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.masterVendors().then((r) => { setVendors(r.vendors); setMeta({ categories: r.categories, statuses: r.statuses }); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the vendor list"));
  }, []);

  const shown = useMemo(() => (vendors ?? []).filter((v) => filter === "all" || v.category === filter), [vendors, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of vendors ?? []) c[v.status] = (c[v.status] ?? 0) + 1;
    return c;
  }, [vendors]);

  if (!vendors || !meta) return error ? <p className="tiny" role="alert">{error}</p> : null;

  const patch = async (v: Vendor, change: Parameters<typeof api.masterUpdateVendor>[1]) => {
    setError(null);
    try {
      const { vendor } = await api.masterUpdateVendor(v.id, change);
      setVendors((all) => (all ?? []).map((x) => (x.id === v.id ? vendor : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save");
    }
  };

  const add = async () => {
    setError(null);
    try {
      const { vendor } = await api.masterAddVendor(draft);
      setVendors((all) => [...(all ?? []), vendor]);
      setDraft({ name: "", category: draft.category, area: "", offers: "", sourceUrl: "" });
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that");
    }
  };

  const remove = async (v: Vendor) => {
    setError(null);
    try {
      await api.masterDeleteVendor(v.id);
      setVendors((all) => (all ?? []).filter((x) => x.id !== v.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that");
    }
  };

  const label = (id: VendorCategory) => meta.categories.find((c) => c.id === id)?.label ?? id;

  return (
    <section className="card stack" aria-label="Event vendors">
      <h3 style={{ margin: 0 }}>Event vendors</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Businesses that could help put on the club's events. These are leads from research: nothing here was confirmed with
        the business, and prices come from listings that may be out of date. Add who you speak to and what was quoted.
      </p>
      <p className="tiny" style={{ margin: 0 }}>
        {meta.statuses.map((s) => `${STATUS_LABEL[s]} ${counts[s] ?? 0}`).join(" · ")}
      </p>

      <div className="field">
        <label htmlFor="vendor-filter">Show</label>
        <select id="vendor-filter" value={filter} onChange={(e) => setFilter(e.target.value as VendorCategory | "all")}>
          <option value="all">Everything ({vendors.length})</option>
          {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.label} ({vendors.filter((v) => v.category === c.id).length})</option>)}
        </select>
      </div>

      {shown.map((v) => (
        <div key={v.id} className="card card-quiet stack" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-block" aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>
            <span className="row-between" style={{ width: "100%" }}>
              <span className="small"><strong>{v.name}</strong></span>
              <span className={`pill${v.status === "booked" ? " pill-safe" : ""}`}>{STATUS_LABEL[v.status]}</span>
            </span>
          </button>
          <span className="tiny muted">{label(v.category)}{v.area ? ` · ${v.area}` : ""}</span>

          {open === v.id && (
            <div className="stack" style={{ gap: 8 }}>
              <p className="small" style={{ margin: 0 }}>{v.offers}</p>
              {v.notes && <p className="tiny muted" style={{ margin: 0 }}>{v.notes}</p>}
              {v.sourceUrl && <a className="tiny" href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Where this was found ↗</a>}

              <div className="field">
                <label htmlFor={`st-${v.id}`}>Status</label>
                <select id={`st-${v.id}`} value={v.status} onChange={(e) => void patch(v, { status: e.target.value as VendorStatus })}>
                  {meta.statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              {(["contactName", "phone", "email"] as const).map((k) => (
                <div className="field" key={k}>
                  <label htmlFor={`${k}-${v.id}`}>{k === "contactName" ? "Who you spoke to" : k === "phone" ? "Phone" : "Email"}</label>
                  <input id={`${k}-${v.id}`} defaultValue={v[k] ?? ""} onBlur={(e) => { if (e.target.value !== (v[k] ?? "")) void patch(v, { [k]: e.target.value }); }} />
                </div>
              ))}
              <div className="field">
                <label htmlFor={`own-${v.id}`}>Your notes (quotes, dates, what was agreed)</label>
                <textarea id={`own-${v.id}`} rows={3} defaultValue={v.ownerNotes ?? ""}
                  onBlur={(e) => { if (e.target.value !== (v.ownerNotes ?? "")) void patch(v, { ownerNotes: e.target.value }); }} />
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => void remove(v)}>Remove from the list</button>
            </div>
          )}
        </div>
      ))}

      {!adding ? (
        <button className="btn btn-block" onClick={() => setAdding(true)}>Add a vendor</button>
      ) : (
        <div className="card card-quiet stack" style={{ gap: 8 }}>
          <div className="field"><label htmlFor="nv-name">Name</label>
            <input id="nv-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="nv-cat">Type</label>
            <select id="nv-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as VendorCategory })}>
              {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
          <div className="field"><label htmlFor="nv-area">Where</label>
            <input id="nv-area" value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} /></div>
          <div className="field"><label htmlFor="nv-offers">What they do</label>
            <input id="nv-offers" value={draft.offers} onChange={(e) => setDraft({ ...draft, offers: e.target.value })} /></div>
          <div className="field"><label htmlFor="nv-url">Link (https)</label>
            <input id="nv-url" value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} /></div>
          <div className="row">
            <button className="btn grow" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn btn-primary grow" disabled={!draft.name.trim()} onClick={() => void add()}>Save</button>
          </div>
        </div>
      )}
      {error && <p className="tiny" role="alert">{error}</p>}
    </section>
  );
}
