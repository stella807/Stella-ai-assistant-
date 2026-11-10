import type { Article } from "../blog.ts";

export const article: Article = {
  slug: { en: "concierge-puerto-rico-prices", es: "concierge-puerto-rico-precios" },
  publishedOn: "2026-11-10",
  title: {
    en: "Concierge in Puerto Rico: who publishes a price?",
    es: "Concierge en Puerto Rico: ¿quién publica su precio?",
  },
  description: {
    en: "We read the websites of five concierge and assistant services in Puerto Rico. Two publish a price. Here is what each one says it does and what it costs.",
    es: "Leímos las páginas web de cinco servicios de concierge y asistentes en Puerto Rico. Dos publican un precio. Esto es lo que cada uno dice que hace y lo que cuesta.",
  },
  blocks: [
    { p: {
      en: "If a service will not tell you what it costs until you call, you are not shopping. You are negotiating, and the other side already knows the price.",
      es: "Si un servicio no te dice lo que cuesta hasta que llamas, no estás comprando. Estás negociando, y el otro lado ya sabe el precio.",
    } },
    { p: {
      en: "So we did the reading for you. In November 2026 we opened the website of each concierge and personal-assistant service we found on the island and wrote down two things: what it says it does, and what it says it costs.",
      es: "Así que leímos por ti. En noviembre de 2026 abrimos la página web de cada servicio de concierge y asistentes personales que encontramos en la isla y anotamos dos cosas: lo que dice que hace y lo que dice que cuesta.",
    } },
    { table: {
      head: [
        { en: "Company", es: "Compañía" },
        { en: "What it says it does", es: "Lo que dice que hace" },
        { en: "Price on its website", es: "Precio en su página" },
      ],
      rows: [
        [{ en: "Luxplora", es: "Luxplora" },
          { en: "Concierge and personal assistant: errands, paperwork, real estate, events", es: "Concierge y asistente personal: mandados, papeleo, bienes raíces, eventos" },
          { en: "$100 an hour with a 2-hour minimum; $750 for 8 hours", es: "$100 la hora con un mínimo de 2 horas; $750 por 8 horas" }],
        [{ en: "ETC Puerto Rico", es: "ETC Puerto Rico" },
          { en: "Chauffeur and airport transfers, concierge, personal assistant, grocery shopping", es: "Chofer y traslados al aeropuerto, concierge, asistente personal, compra de supermercado" },
          { en: "Not published", es: "No publicado" }],
        [{ en: "Bia Concierge", es: "Bia Concierge" },
          { en: "Personal and executive assistants, special projects, staffing, memberships", es: "Asistentes personales y ejecutivos, proyectos especiales, personal, membresías" },
          { en: "Not published", es: "No publicado" }],
        [{ en: "We Got This Puerto Rico", es: "We Got This Puerto Rico" },
          { en: "Lifestyle concierge and relocation, including eldercare referrals", es: "Concierge de estilo de vida y mudanzas, incluye referidos de cuidado de mayores" },
          { en: "Not published", es: "No publicado" }],
        [{ en: "MD Concierge PR", es: "MD Concierge PR" },
          { en: "A doctor membership: visits, home visits, telemedicine", es: "Una membresía médica: visitas, visitas a domicilio, telemedicina" },
          { en: "From $260 a month, or $2,800 a year", es: "Desde $260 al mes, o $2,800 al año" }],
        [{ en: "**Safehubby**", es: "**Safehubby**" },
          { en: "Assistants, errands, hospital companions, rides and bodyguards, with free SOS and check-ins", es: "Asistentes, mandados, acompañantes de hospital, transporte y guardaespaldas, con SOS y chequeos gratis" },
          { en: "Assistant {{hourly}} an hour; errands from {{errandFrom}}; plans from {{cheapestPlan}} a month", es: "Asistente {{hourly}} la hora; mandados desde {{errandFrom}}; planes desde {{cheapestPlan}} al mes" }],
      ],
    } },
    { h2: { en: "What the table says", es: "Lo que dice la tabla" } },
    { ul: [
      { en: "**Three of the five publish no price.** That is their right. It is also why you cannot compare them without three phone calls.",
        es: "**Tres de los cinco no publican precio.** Están en su derecho. También es la razón por la que no puedes compararlos sin hacer tres llamadas." },
      { en: "**The one hourly rate we found is $100, with a two-hour minimum.** So the smallest job there is $200. A Safehubby assistant is {{hourly}} an hour once the hours in your plan are used.",
        es: "**La única tarifa por hora que encontramos es de $100, con un mínimo de dos horas.** Es decir, el trabajo más pequeño allí cuesta $200. Un asistente de Safehubby cuesta {{hourly}} la hora cuando se acaban las horas de tu plan." },
      { en: "**MD Concierge PR is a different thing.** Its page describes a doctor's membership: visits, home visits and telemedicine. Errands and hospital company are not on it.",
        es: "**MD Concierge PR es otra cosa.** Su página describe una membresía médica: visitas, visitas a domicilio y telemedicina. Los mandados y la compañía en el hospital no aparecen." },
    ] },
    { h2: { en: "What to ask any concierge before you pay", es: "Qué preguntarle a cualquier concierge antes de pagar" } },
    { ul: [
      { en: "What is the price, in writing, before the job starts?", es: "¿Cuál es el precio, por escrito, antes de empezar el trabajo?" },
      { en: "Is there a minimum number of hours?", es: "¿Hay un mínimo de horas?" },
      { en: "Who pays for what is bought, and is there a limit that I set?", es: "¿Quién paga lo que se compra, y hay un límite que yo fijo?" },
      { en: "Who exactly is coming, and has that person been screened?", es: "¿Quién viene exactamente, y esa persona fue verificada?" },
      { en: "What happens at 1 a.m.?", es: "¿Qué pasa a la 1 de la mañana?" },
    ] },
    { h2: { en: "How Safehubby answers them", es: "Cómo responde Safehubby" } },
    { p: {
      en: "Our prices are on [our home page](/) before you make an account. You set a spending limit for anything bought for you, and you are never charged past it. The person who comes is hired and screened by us. Check-ins, location sharing and SOS are free on every plan. For the full breakdown, see [what a personal assistant costs in Puerto Rico](/blog/personal-assistant-cost-puerto-rico).",
      es: "Nuestros precios están en [nuestra página principal](/es) antes de que crees una cuenta. Tú fijas un límite de gasto para lo que se compre por ti, y nunca se te cobra de más. La persona que llega fue contratada y verificada por nosotros. Los chequeos, la ubicación y el SOS son gratis en todos los planes. Para el desglose completo, mira [cuánto cuesta un asistente personal en Puerto Rico](/es/blog/cuanto-cuesta-asistente-personal-puerto-rico).",
    } },
    { p: {
      en: "We will keep this page current. If you run one of these services and something here is out of date, write to contact@safehubby.com and we will correct it.",
      es: "Mantendremos esta página al día. Si diriges uno de estos servicios y algo aquí está desactualizado, escribe a contact@safehubby.com y lo corregimos.",
    } },
  ],
  companies: [
    { name: "Luxplora", source: "https://luxplorapuertorico.com/luxplora-concierge-personal-assistant-service/", checked: "2026-11" },
    { name: "ETC Puerto Rico", source: "https://www.etcpuertorico.com/", checked: "2026-11" },
    { name: "Bia Concierge", source: "https://www.biaconcierge.com/", checked: "2026-11" },
    { name: "We Got This Puerto Rico", source: "https://wegotthisprrealty.com/our-services", checked: "2026-11" },
    { name: "MD Concierge PR", source: "https://mdconciergepr.com/Membership/", checked: "2026-11" },
  ],
};
