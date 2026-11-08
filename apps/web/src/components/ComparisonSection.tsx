import { useLanguage } from "../i18n.tsx";

type Cell = "yes" | "some" | "no";

interface Row { label: { en: string; es: string }; values: [Cell, Cell, Cell, Cell]; note?: { en: string; es: string } }

/** A general comparison of the kinds of help people use today, not a claim about any one company. */
const ROWS: Row[] = [
  { label: { en: "Assistant and errands", es: "Asistente y mandados" }, values: ["yes", "some", "no", "no"] },
  { label: { en: "Hospital-day companion", es: "Acompañante en el hospital" }, values: ["yes", "yes", "no", "no"] },
  { label: { en: "Rides", es: "Transporte" }, values: ["yes", "no", "yes", "some"], note: { en: "Armored SUVs", es: "SUV blindadas" } },
  { label: { en: "Armed bodyguard, by the hour", es: "Guardaespaldas armado, por hora" }, values: ["yes", "no", "no", "yes"] },
  { label: { en: "SOS and check-ins", es: "SOS y chequeos" }, values: ["yes", "no", "no", "no"] },
  { label: { en: "Prices shown up front", es: "Precios a la vista" }, values: ["yes", "some", "yes", "no"] },
  { label: { en: "Spanish and English", es: "Español e inglés" }, values: ["yes", "some", "yes", "some"] },
  { label: { en: "One account, one card", es: "Una cuenta, una tarjeta" }, values: ["yes", "no", "no", "no"] },
];

const WORDS = {
  en: {
    heading: "How Safehubby compares",
    lead: "Most help on the island does one thing. Safehubby puts it on one membership.",
    cols: ["Safehubby", "Caretaker", "Rideshare", "Security firm"],
    yes: "Yes", some: "Sometimes", no: "No",
    foot: "✓ yes · ~ sometimes · — no. A general comparison of typical options. It is not a statement about any one company, and what each offers varies.",
  },
  es: {
    heading: "Cómo nos comparamos",
    lead: "La mayoría de la ayuda en la isla hace una sola cosa. Safehubby la reúne en una sola membresía.",
    cols: ["Safehubby", "Cuidador", "App de viajes", "Seguridad"],
    yes: "Sí", some: "A veces", no: "No",
    foot: "✓ sí · ~ a veces · — no. Una comparación general de opciones típicas. No es una afirmación sobre ninguna compañía en particular, y lo que ofrece cada una varía.",
  },
};

const MARK: Record<Cell, string> = { yes: "✓", some: "~", no: "—" };

export function ComparisonSection() {
  const lang = useLanguage().language === "es" ? "es" : "en";
  const w = WORDS[lang];
  return (
    <section className="card stack rival-section" aria-label={w.heading}>
      <h2>{w.heading}</h2>
      <p className="small muted" style={{ margin: 0 }}>{w.lead}</p>
      <div className="rival-scroll">
        <table className="rival-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">{w.heading}</span></th>
              {w.cols.map((c, i) => <th key={c} scope="col" className={i === 0 ? "rival-us" : undefined}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label.en}>
                <th scope="row">{r.label[lang]}{r.note && <div className="tiny muted">{r.note[lang]}</div>}</th>
                {r.values.map((v, i) => (
                  <td key={i} className={`rival-${v}${i === 0 ? " rival-us" : ""}`}>
                    <span aria-hidden="true">{MARK[v]}</span>
                    <span className="sr-only">{w[v]}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>{w.foot}</p>
    </section>
  );
}
