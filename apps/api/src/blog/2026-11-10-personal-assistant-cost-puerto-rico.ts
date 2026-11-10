import type { Article } from "../blog.ts";

export const article: Article = {
  slug: { en: "personal-assistant-cost-puerto-rico", es: "cuanto-cuesta-asistente-personal-puerto-rico" },
  publishedOn: "2026-11-10",
  title: {
    en: "How much does a personal assistant cost in Puerto Rico?",
    es: "¿Cuánto cuesta un asistente personal en Puerto Rico?",
  },
  description: {
    en: "Hourly rates, minimums, monthly plans and errands: what a personal assistant costs in Puerto Rico in 2026, with the published prices we could find.",
    es: "Tarifas por hora, mínimos, planes mensuales y mandados: lo que cuesta un asistente personal en Puerto Rico en 2026, con los precios publicados que encontramos.",
  },
  blocks: [
    { p: {
      en: "There are three ways to pay for a personal assistant on the island: by the hour, by the errand, or with a monthly plan that includes hours. Which is cheapest depends on how often you need someone.",
      es: "Hay tres formas de pagar por un asistente personal en la isla: por hora, por mandado, o con un plan mensual que incluye horas. Cuál sale más barata depende de cada cuánto necesitas a alguien.",
    } },
    { h2: { en: "By the hour", es: "Por hora" } },
    { p: {
      en: "Few services publish an hourly rate. One that does, Luxplora, lists $100 an hour with a two-hour minimum, or $750 for eight hours. Safehubby lists {{hourly}} an hour for assistant time beyond what your plan includes. We compared every service we found in [who publishes a price in Puerto Rico](/blog/concierge-puerto-rico-prices).",
      es: "Pocos servicios publican una tarifa por hora. Uno que sí, Luxplora, indica $100 la hora con un mínimo de dos horas, o $750 por ocho horas. Safehubby indica {{hourly}} la hora por el tiempo de asistente que pase de lo que incluye tu plan. Comparamos todos los servicios que encontramos en [quién publica su precio en Puerto Rico](/es/blog/concierge-puerto-rico-precios).",
    } },
    { h2: { en: "By the errand", es: "Por mandado" } },
    { p: {
      en: "For one small thing, an hour is too much. A Safehubby errand runner fetches one item or runs one errand from {{errandFrom}}, plus what is bought, under a spending limit you set.",
      es: "Para una cosa pequeña, una hora es demasiado. Un mensajero de Safehubby busca una cosa o hace un mandado desde {{errandFrom}}, más lo que se compre, con un límite de gasto que tú fijas.",
    } },
    { h2: { en: "With a monthly plan", es: "Con un plan mensual" } },
    { p: {
      en: "If you need help every week, a plan costs less than paying by the hour. Safehubby's paid plans start at {{cheapestPlan}} a month, and the plans from Premium up include assistant hours each month. Those hours are used first. You pay the hourly rate only after they run out.",
      es: "Si necesitas ayuda todas las semanas, un plan cuesta menos que pagar por hora. Los planes de pago de Safehubby empiezan en {{cheapestPlan}} al mes, y los planes de Premium en adelante incluyen horas de asistente cada mes. Esas horas se usan primero. Pagas la tarifa por hora solo cuando se acaban.",
    } },
    { h2: { en: "Hospital days and protection", es: "Días de hospital y protección" } },
    { p: {
      en: "Two jobs are priced on their own. A caretaker who stays with a patient for a full hospital day, up to 12 hours, is {{hospitalDay}}. A licensed, armed bodyguard is {{armedHourly}} an hour.",
      es: "Dos trabajos tienen su propio precio. Un cuidador que se queda con un paciente un día completo de hospital, hasta 12 horas, cuesta {{hospitalDay}}. Un guardaespaldas armado y con licencia cuesta {{armedHourly}} la hora.",
    } },
    { h2: { en: "A quick way to choose", es: "Una forma rápida de escoger" } },
    { table: {
      head: [{ en: "What you need", es: "Lo que necesitas" }, { en: "The cheapest way", es: "La forma más barata" }],
      rows: [
        [{ en: "One thing picked up", es: "Que te busquen una cosa" }, { en: "An errand, from {{errandFrom}}", es: "Un mandado, desde {{errandFrom}}" }],
        [{ en: "Someone for an afternoon", es: "Alguien por una tarde" }, { en: "By the hour, {{hourly}} an hour", es: "Por hora, {{hourly}} la hora" }],
        [{ en: "Help every week", es: "Ayuda todas las semanas" }, { en: "A plan with included hours", es: "Un plan con horas incluidas" }],
        [{ en: "A parent in the hospital", es: "Un padre en el hospital" }, { en: "A hospital day, {{hospitalDay}}", es: "Un día de hospital, {{hospitalDay}}" }],
      ],
    } },
    { p: {
      en: "The current prices are always on [the Safehubby home page](/), before you make an account.",
      es: "Los precios al día siempre están en [la página principal de Safehubby](/es), antes de que crees una cuenta.",
    } },
  ],
  faq: [
    { q: { en: "Is there a minimum number of hours?", es: "¿Hay un mínimo de horas?" },
      a: { en: "It depends on the service. Luxplora's page lists a two-hour minimum. Ask before you book.", es: "Depende del servicio. La página de Luxplora indica un mínimo de dos horas. Pregunta antes de reservar." } },
    { q: { en: "Who pays for the things an assistant buys?", es: "¿Quién paga lo que compra un asistente?" },
      a: { en: "You do, at cost. With Safehubby you set a spending limit first, and you are charged only what was actually spent, never more than the limit.", es: "Tú, al costo. Con Safehubby primero fijas un límite de gasto, y se te cobra solo lo que de verdad se gastó, nunca más que el límite." } },
    { q: { en: "Can I book an assistant for a relative?", es: "¿Puedo reservar un asistente para un familiar?" },
      a: { en: "Yes. You can send an assistant to a parent or grandparent who does not use the app, with their name and where they are.", es: "Sí. Puedes enviar un asistente a un padre o abuelo que no usa la app, con su nombre y dónde está." } },
  ],
  companies: [
    { name: "Luxplora", source: "https://luxplorapuertorico.com/luxplora-concierge-personal-assistant-service/", checked: "2026-11" },
  ],
};
