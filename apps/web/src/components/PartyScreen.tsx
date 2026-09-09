import { useEffect, useMemo, useState } from "react";
import { api, type CartLine, type CartSummary, type PartyCategory, type PartyItem } from "../api.ts";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * Party supply — the daytime half of the product. Safehubby already knows a
 * group is getting together and already talks to delivery and ride providers;
 * planning the thing is the same problem one step earlier.
 */
export function PartyScreen() {
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
      setError(e instanceof Error ? e.message : "Could not save the cart");
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
        <h2>Throw the party</h2>
        <p className="small muted">
          Chairs, food, decorations, entertainment, and the boring things everyone forgets.
        </p>
      </div>

      <section className="card">
        <h3>Start from a headcount</h3>
        <div className="row">
          <div className="field grow">
            <label htmlFor="guests">People coming</label>
            <input id="guests" type="number" inputMode="numeric" min={1} value={guests}
              onChange={(e) => setGuests(Number(e.target.value))} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || guests < 1}
          onClick={async () => {
            const s = await api.partySuggest(guests);
            save(s.lines);
          }}>
          Build me a cart for {guests}
        </button>
        <p className="tiny muted">A starting point you can edit — nothing is ordered.</p>
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
                        {money(i.priceCents)} {i.unit} · {i.vendor}{i.rental ? " · rental" : ""}
                      </div>
                    </div>
                    <div className="stepper">
                      <button className="btn btn-sm" disabled={busy || !(qty[i.sku] ?? 0)}
                        onClick={() => bump(i.sku, -1)} aria-label={`Remove one ${i.name}`}>−</button>
                      <span>{qty[i.sku] ?? 0}</span>
                      <button className="btn btn-sm" disabled={busy}
                        onClick={() => bump(i.sku, 1)} aria-label={`Add one ${i.name}`}>+</button>
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
          <h3>Your cart</h3>
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

          <div className="row-between"><span className="small muted">To buy</span><span>{money(summary.purchaseCents)}</span></div>
          <div className="row-between"><span className="small muted">Rentals (come back)</span><span>{money(summary.rentalCents)}</span></div>
          <div className="row-between total"><strong>Total</strong><strong>{money(summary.subtotalCents)}</strong></div>

          {summary.coversGuests !== null && (
            <p className="tiny muted">
              Comfortably covers about {summary.coversGuests} people — set by whichever category is thinnest,
              so twelve chairs and food for forty still seats twelve.
            </p>
          )}

          <button className="btn btn-block" disabled>Checkout — not connected yet</button>
          <p className="tiny muted">
            Vendors are catalogue entries in this build. Nothing here places a real order or takes payment.
          </p>
        </section>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}
