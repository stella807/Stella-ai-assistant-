import { useEffect, useState } from "react";
import { useLanguage } from "../i18n.tsx";
import { CHECKLIST_SHOP_WORDS } from "../app/checklist-shop-copy.ts";

interface Item { slug: string; title: string; description: string }
interface Bought { title: string; description: string; groups: { heading: string; items: string[] }[]; text: string }

/** The checklists sold to people by card. Coming back from Stripe with ?paid= shows the one bought, once the server confirms payment. */
export function ChecklistShop() {
  const { language } = useLanguage();
  const w = CHECKLIST_SHOP_WORDS[language];
  const paidId = new URLSearchParams(window.location.search).get("paid");
  const [list, setList] = useState<{ price: string; canPay: boolean; checklists: Item[] } | null>(null);
  const [bought, setBought] = useState<Bought | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const lang = `lang=${language}`;
    if (paidId) {
      fetch(`/api/people/checklists/paid?session_id=${encodeURIComponent(paidId)}&${lang}`)
        .then(async (r) => { const b = await r.json(); if (r.ok) setBought(b); else setMessage(b.error ?? w.failed); })
        .catch(() => setMessage(w.failed));
      return;
    }
    fetch(`/api/people/checklists?${lang}`).then((r) => r.json()).then(setList).catch(() => setMessage(w.failed));
  }, [language, paidId, w.failed]);

  const buy = async (slug: string) => {
    setMessage(w.opening);
    try {
      const r = await fetch(`/api/people/checklists/checkout?slug=${encodeURIComponent(slug)}&lang=${language}`, { method: "POST" });
      const b = await r.json();
      if (r.ok && typeof b.url === "string" && b.url.startsWith("https://")) window.location.assign(b.url);
      else setMessage(b.error ?? w.failed);
    } catch { setMessage(w.failed); }
  };

  return (
    <main className="checklist-shop">
      <p className="kicker">{w.kicker}</p>
      {bought ? (
        <section>
          <h1>{bought.title}</h1>
          <p>{bought.description}</p>
          {bought.groups.map((g) => (
            <div key={g.heading}>
              <h2>{g.heading}</h2>
              <ul>{g.items.map((i) => <li key={i}>☐ {i}</li>)}</ul>
            </div>
          ))}
          <div className="checklist-shop-actions">
            <button className="btn" onClick={() => { void navigator.clipboard?.writeText(bought.text).then(() => setCopied(true)); }}>{copied ? w.copied : w.copy}</button>
            <button className="btn btn-ghost" onClick={() => window.print()}>{w.print}</button>
            <a className="btn btn-ghost" href={`/checklists${language === "es" ? "?lang=es" : ""}`}>{w.back}</a>
          </div>
        </section>
      ) : (
        <section>
          <h1>{w.title}</h1>
          <p>{w.intro}</p>
          {!paidId && !list && !message && <p>{w.loading}</p>}
          {list && !list.canPay && <p>{w.notReady}</p>}
          {list?.checklists.map((c) => (
            <article key={c.slug} className="checklist-shop-item">
              <h2>{c.title}</h2>
              <p>{c.description}</p>
              <button className="btn" disabled={!list.canPay} onClick={() => void buy(c.slug)}>{w.buy} · {list.price}</button>
            </article>
          ))}
        </section>
      )}
      {message && <p role="status">{message}</p>}
      <p className="checklist-shop-note">{w.note}</p>
    </main>
  );
}
