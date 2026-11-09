import { useEffect, useMemo, useState } from "react";
import { DEFAULT_VENDOR_LIST, type Vendor, type VendorCategory, type VendorList, type VendorStatus } from "@safehubby/core";
import { api } from "../api.ts";
import { safeHttpUrl } from "../app/safe-url.ts";

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
  const [lists, setLists] = useState<VendorList[]>([]);
  const [listId, setListId] = useState<string>("");
  // "new": typing the name of a list to create; "rename": changing the selected list's name.
  const [listForm, setListForm] = useState<"new" | "rename" | null>(null);
  const [listName, setListName] = useState("");
  const [filter, setFilter] = useState<VendorCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", category: "event-planner" as VendorCategory, area: "", offers: "", sourceUrl: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", listId: "", category: "event-planner" as VendorCategory, area: "", offers: "", sourceUrl: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.masterVendors().then((r) => { setVendors(r.vendors); setLists(r.lists); setListId(r.lists[0]?.id ?? ""); setMeta({ categories: r.categories, statuses: r.statuses }); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the vendor list"));
  }, []);

  const inList = useMemo(() => (vendors ?? []).filter((v) => v.listId === listId), [vendors, listId]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inList.filter((v) => (filter === "all" || v.category === filter)
      && (!q || `${v.name} ${v.area ?? ""} ${v.offers ?? ""}`.toLowerCase().includes(q)));
  }, [inList, filter, query]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of inList) c[v.status] = (c[v.status] ?? 0) + 1;
    return c;
  }, [inList]);

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

  const startEdit = (v: Vendor) => {
    setEdit({ name: v.name, listId: v.listId ?? listId, category: v.category, area: v.area ?? "", offers: v.offers ?? "", sourceUrl: v.sourceUrl ?? "" });
    setEditing(v.id);
  };

  const saveEdit = async (v: Vendor) => {
    await patch(v, edit);
    setEditing(null);
  };

  const add = async () => {
    setError(null);
    try {
      const { vendor } = await api.masterAddVendor({ ...draft, listId });
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

  const saveList = async () => {
    setError(null);
    try {
      if (listForm === "new") {
        const { list } = await api.masterAddVendorList(listName);
        setLists((all) => [...all, list]);
        setListId(list.id);
        setFilter("all");
      } else if (listForm === "rename") {
        const { list } = await api.masterRenameVendorList(listId, listName);
        setLists((all) => all.map((l) => (l.id === list.id ? list : l)));
      }
      setListForm(null);
      setListName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That list did not save");
    }
  };

  const deleteList = async () => {
    setError(null);
    try {
      await api.masterDeleteVendorList(listId);
      const rest = lists.filter((l) => l.id !== listId);
      setLists(rest);
      setListId(rest[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that list");
    }
  };

  const currentList = lists.find((l) => l.id === listId);
  const label = (id: VendorCategory) => meta.categories.find((c) => c.id === id)?.label ?? id;

  return (
    <section className="card stack" aria-label="Event vendors">
      <h3 style={{ margin: 0 }}>Event vendors{currentList ? `: ${currentList.name}` : ""}</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Businesses that could help put on the club's events. These are leads from research: nothing here was confirmed with
        the business, and prices come from listings that may be out of date. Add who you speak to and what was quoted.
      </p>
      <div className="vendor-counts">
        {meta.statuses.map((s) => (
          <span key={s} className={`vendor-count${s === "booked" ? " is-booked" : ""}`}>
            <strong>{counts[s] ?? 0}</strong> {STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      <div className="field">
        <label htmlFor="vendor-list">Vendor list</label>
        <select id="vendor-list" value={listId} onChange={(e) => { setListId(e.target.value); setFilter("all"); setListForm(null); setOpen(null); setEditing(null); }}>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({(vendors ?? []).filter((v) => v.listId === l.id).length})</option>)}
        </select>
      </div>
      {listForm ? (
        <div className="card card-quiet stack" style={{ gap: 8 }}>
          <div className="field">
            <label htmlFor="vendor-list-name">{listForm === "new" ? "Name the new list (an area, like Texas)" : "New name for this list"}</label>
            <input id="vendor-list-name" value={listName} maxLength={80} onChange={(e) => setListName(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn grow" onClick={() => { setListForm(null); setListName(""); }}>Cancel</button>
            <button className="btn btn-primary grow" disabled={!listName.trim()} onClick={() => void saveList()}>{listForm === "new" ? "Create list" : "Save name"}</button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button className="btn btn-sm" onClick={() => { setListForm("new"); setListName(""); }}>New list</button>
          <button className="btn btn-sm btn-ghost" disabled={!currentList} onClick={() => { setListForm("rename"); setListName(currentList?.name ?? ""); }}>Rename</button>
          <button className="btn btn-sm btn-ghost" disabled={!currentList || currentList.id === DEFAULT_VENDOR_LIST.id || inList.length > 0 || lists.length <= 1}
            title={currentList?.id === DEFAULT_VENDOR_LIST.id ? "The Puerto Rico list stays" : inList.length > 0 ? "Move or remove its vendors first" : undefined} onClick={() => void deleteList()}>Delete list</button>
        </div>
      )}
      {inList.length === 0 && currentList && <p className="tiny muted" style={{ margin: 0 }}>{currentList.name} has no vendors yet. Add the first one below.</p>}

      <div className="field">
        <label htmlFor="vendor-filter">Show</label>
        <select id="vendor-filter" value={filter} onChange={(e) => setFilter(e.target.value as VendorCategory | "all")}>
          <option value="all">Everything in this list ({inList.length})</option>
          {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.label} ({inList.filter((v) => v.category === c.id).length})</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="vendor-search">Search</label>
        <input id="vendor-search" type="search" placeholder="Name, place or what they do" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {shown.map((v) => (
        <div key={v.id} className={`vendor-row stack${open === v.id ? " is-open" : ""}`} style={{ gap: 6 }}>
          <button className="vendor-head" aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>
            <span className="vendor-name">
              <strong>{v.name}</strong>
              <span className="tiny muted">{label(v.category)}{v.area ? ` · ${v.area}` : ""}</span>
            </span>
            <span className={`pill${v.status === "booked" ? " pill-safe" : ""}`}>{STATUS_LABEL[v.status]}</span>
          </button>

          {open === v.id && (
            <div className="stack" style={{ gap: 8 }}>
              {editing === v.id ? (
                <div className="card card-quiet stack" style={{ gap: 8 }}>
                  <div className="field"><label htmlFor={`en-${v.id}`}>Name</label>
                    <input id={`en-${v.id}`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                  <div className="field"><label htmlFor={`el-${v.id}`}>List</label>
                    <select id={`el-${v.id}`} value={edit.listId} onChange={(e) => setEdit({ ...edit, listId: e.target.value })}>
                      {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                  <div className="field"><label htmlFor={`ec-${v.id}`}>Type</label>
                    <select id={`ec-${v.id}`} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as VendorCategory })}>
                      {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
                  <div className="field"><label htmlFor={`ea-${v.id}`}>Where</label>
                    <input id={`ea-${v.id}`} value={edit.area} onChange={(e) => setEdit({ ...edit, area: e.target.value })} /></div>
                  <div className="field"><label htmlFor={`eo-${v.id}`}>What they do</label>
                    <input id={`eo-${v.id}`} value={edit.offers} onChange={(e) => setEdit({ ...edit, offers: e.target.value })} /></div>
                  <div className="field"><label htmlFor={`eu-${v.id}`}>Link (https)</label>
                    <input id={`eu-${v.id}`} value={edit.sourceUrl} onChange={(e) => setEdit({ ...edit, sourceUrl: e.target.value })} /></div>
                  <div className="row">
                    <button className="btn grow" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn btn-primary grow" disabled={!edit.name.trim()} onClick={() => void saveEdit(v)}>Save changes</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="small" style={{ margin: 0 }}>{v.offers}</p>
                  <button className="btn btn-sm btn-ghost" onClick={() => startEdit(v)}>Edit name and details</button>
                </>
              )}
              {v.notes && <p className="tiny muted" style={{ margin: 0 }}>{v.notes}</p>}
              {safeHttpUrl(v.sourceUrl) && <a className="tiny" href={safeHttpUrl(v.sourceUrl)} target="_blank" rel="noopener noreferrer">Where this was found ↗</a>}

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
