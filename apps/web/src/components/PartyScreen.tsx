import { useEffect, useMemo, useState } from "react";
import { api, type CartLine, type CartSummary, type PartyCategory, type PartyItem } from "../api.ts";

import { money } from "../money.ts";
import { useLanguage } from "../i18n.tsx";
import { gamesWords } from "../app/games-copy.ts";

/**
 * Party supply — the daytime half of the product. Safehubby already knows a
 * group is getting together and already talks to delivery and ride providers;
 * planning the thing is the same problem one step earlier.
 */
export function PartyScreen() {
  const w = gamesWords(useLanguage().language).party;
  const [categories, setCategories] = useState<PartyCategory[]>([]);
  const [items, setItems] = useState<PartyItem[]>([]);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [summary, setSummary] = useState<CartSummary | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [guests, setGuests] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.partyCatalog().then((c) => { setCategories(c.categories); setItems(c.items); setOpenCat(c.categories[0]?.id ?? null); }).catch(() => {});
    api.partyCart().then((c) => { setLines(c.lines); setSummary(c.summary); }).catch(() => {});
  }, []);

  const qty = useMemo(() => Object.fromEntries(lines.map((l) => [l.sku, l.qty])), [lines]);

  const save = async (next: CartLine[]) => {
    setLines(next);
    setBusy(true);
    setError(null);
    try {
      setSummary((await api.savePartyCart(next.filter((l) => l.qty > 0))).summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : w.failed);
    } finally {
      setBusy(false);
    }
  };

  const bump = (sku: string, delta: number) => {
    const current = qty[sku] ?? 0;
    const next = Math.max(0, current + delta);
    const without = lines.filter((l) => l.sku !== sku);
    save(next === 0 ? without : [...without, { sku, qty: next }]);
  };

  return (
    <div className="stack">
      <div>
        <h2>{w.title}</h2>
        <p className="small muted">{w.lead}</p>
      </div>

      <section className="card">
        <h3>{w.headcount}</h3>
        <div className="row">
          <div className="field grow">
            <label htmlFor="guests">{w.coming}</label>
            <input id="guests" type="number" inputMode="numeric" min={1} value={guests}
              onChange={(e) => setGuests(Number(e.target.value))} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || guests < 1}
          onClick={async () => {
            const s = await api.partySuggest(guests);
            save(s.lines);
          }}>
          {w.build(guests)}
        </button>
        <p className="tiny muted">{w.starting}</p>
      </section>

      {categories.map((c) => {
        const catItems = items.filter((i) => i.category === c.id);
        const inCart = catItems.filter((i) => (qty[i.sku] ?? 0) > 0).length;
        const isOpen = openCat === c.id;

        return (
          <section key={c.id} className="card">
            <button className="cat" onClick={() => setOpenCat(isOpen ? null : c.id)} aria-expanded={isOpen}>
              <span className="grow">
                <strong>{c.name}</strong>
                <span className="tiny muted">{c.blurb}</span>
              </span>
              {inCart > 0 && <span className="pill pill-safe">{inCart}</span>}
              <span className="chev" aria-hidden="true">{isOpen ? "−" : "+"}</span>
            </button>

            {isOpen && (
              <ul className="timeline">
                {catItems.map((i) => (
                  <li key={i.sku}>
                    <div className="grow">
                      <strong className="small">{i.name}</strong>
                      <div className="tiny muted">
                        {money(i.priceCents)} {i.unit} · {i.vendor}{i.rental ? w.rental : ""}
                      </div>
                    </div>
                    <div className="stepper">
                      <button className="btn btn-sm" disabled={busy || !(qty[i.sku] ?? 0)}
                        onClick={() => bump(i.sku, -1)} aria-label={w.remove(i.name)}>−</button>
                      <span>{qty[i.sku] ?? 0}</span>
                      <button className="btn btn-sm" disabled={busy}
                        onClick={() => bump(i.sku, 1)} aria-label={w.add(i.name)}>+</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {summary && summary.subtotalCents > 0 && (
        <section className="card">
          <h3>{w.cart}</h3>
          <ul className="timeline">
            {summary.lines.map((l) => (
              <li key={l.item.sku}>
                <div className="grow">
                  <strong className="small">{l.qty}× {l.item.name}</strong>
                  <div className="tiny muted">{l.item.vendor}</div>
                </div>
                <span className="small">{money(l.lineTotalCents)}</span>
              </li>
            ))}
          </ul>

          <div className="row-between"><span className="small muted">{w.toBuy}</span><span>{money(summary.purchaseCents)}</span></div>
          <div className="row-between"><span className="small muted">{w.rentals}</span><span>{money(summary.rentalCents)}</span></div>
          <div className="row-between total"><strong>{w.total}</strong><strong>{money(summary.subtotalCents)}</strong></div>

          {summary.coversGuests !== null && (
            <p className="tiny muted">{w.covers(summary.coversGuests)}</p>
          )}

          <button className="btn btn-block" disabled>{w.checkout}</button>
          <p className="tiny muted">{w.catalogue}</p>
        </section>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}
