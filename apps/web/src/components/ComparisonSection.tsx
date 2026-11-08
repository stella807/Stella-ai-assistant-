import { useLanguage } from "../i18n.tsx";

type Cell = "yes" | "some" | "no";

interface Row { label: { en: string; es: string }; values: [Cell, Cell, Cell, Cell]; note?: { en: string; es: string } }

/** A general comparison of the kinds of help people use today, not a claim about any one company. */
const ROWS: Row[] = [
  { label: { en: "Assistant and errands", es: "Asistente y mandados" }, values: ["yes", "some", "no", "no"] },
  { label: { en: "Hospital-day companion", es: "Acompañante en el hospital" }, values: ["yes", "yes", "no", "no"] },
  { label: { en: "Rides", es: "Transporte" }, values: ["yes", "no", "yes", "some"] },
  { label: { en: "Armed bodyguard, by the hour", es: "Guardaespaldas armado, por hora" }, values: ["yes", "no", "no", "yes"] },
  { label: { en: "SOS and check-ins", es: "SOS y chequeos" }, values: ["yes", "no", "no", "no"] },
  { label: { en: "Book and schedule online", es: "Reserva y programa en línea" }, values: ["yes", "no", "yes", "some"] },
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

interface Named { name: string; href?: string; offers: { en: string; es: string }; price: { en: string; es: string } }

/** What each firm says on its own website (read November 2026), for people choosing between them. Not a ranking. */
const NAMED: Named[] = [
  { name: "Safehubby", offers: { en: "Assistants, errands, hospital companions, rides and bodyguards, with SOS and check-ins", es: "Asistentes, mandados, acompañantes de hospital, transporte y guardaespaldas, con SOS y chequeos" }, price: { en: "Published: extra assistant hours $45 an hour", es: "Publicados: horas extra de asistente $45 la hora" } },
  { name: "Luxplora", href: "https://luxplorapuertorico.com/luxplora-concierge-personal-assistant-service/", offers: { en: "Concierge and personal assistant: errands, paperwork, real estate, events", es: "Concierge y asistente personal: mandados, trámites, bienes raíces, eventos" }, price: { en: "$100 an hour, 2-hour minimum; $750 for 8 hours", es: "$100 la hora, mínimo 2 horas; $750 por 8 horas" } },
  { name: "ETC Puerto Rico", href: "https://www.etcpuertorico.com/", offers: { en: "Chauffeur and airport transfers, concierge, personal assistant and grocery shopping", es: "Chofer y traslados al aeropuerto, concierge, asistente personal y compras de comestibles" }, price: { en: "Not published", es: "No publicados" } },
  { name: "Bia Concierge", href: "https://www.biaconcierge.com/", offers: { en: "Personal and executive assistants, special projects, staffing, memberships", es: "Asistentes personales y ejecutivos, proyectos especiales, personal, membresías" }, price: { en: "Not published", es: "No publicados" } },
  { name: "We Got This Puerto Rico", href: "https://wegotthisprrealty.com/our-services", offers: { en: "Lifestyle concierge and relocation, including eldercare referrals", es: "Concierge de estilo de vida y mudanzas, incluye referidos de cuidado de ancianos" }, price: { en: "Not published", es: "No publicados" } },
  { name: "MD Concierge PR", href: "https://mdconciergepr.com/Membership/", offers: { en: "Doctor membership: visits, home visits, telemedicine (medical, not errands)", es: "Membresía médica: visitas, visitas a domicilio, telemedicina (médico, no mandados)" }, price: { en: "From $260 a month, or $2,800 a year", es: "Desde $260 al mes, o $2,800 al año" } },
];

const NAMED_WORDS = {
  en: { heading: "Concierge services on the island, by name", cols: ["Company", "What it offers", "Price"], foot: "From each company's own website, read in November 2026. Details change, so check their sites. This is not a ranking." },
  es: { heading: "Servicios de concierge en la isla, por nombre", cols: ["Compañía", "Qué ofrece", "Precio"], foot: "Del sitio web de cada compañía, leído en noviembre de 2026. Los detalles cambian, así que revisa sus sitios. No es un ranking." },
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

      <h3 style={{ margin: "8px 0 0" }}>{NAMED_WORDS[lang].heading}</h3>
      <div className="rival-scroll">
        <table className="rival-table rival-named">
          <thead>
            <tr>{NAMED_WORDS[lang].cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
          </thead>
          <tbody>
            {NAMED.map((n, i) => (
              <tr key={n.name} className={i === 0 ? "rival-us" : undefined}>
                <th scope="row">{n.href ? <a href={n.href} target="_blank" rel="noopener noreferrer">{n.name}</a> : n.name}</th>
                <td>{n.offers[lang]}</td>
                <td>{n.price[lang]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>{NAMED_WORDS[lang].foot}</p>
    </section>
  );
}
