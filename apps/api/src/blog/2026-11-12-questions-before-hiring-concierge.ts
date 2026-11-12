import type { Article } from "../blog.ts";

export const article: Article = {
  slug: { en: "questions-before-hiring-a-concierge-puerto-rico", es: "preguntas-antes-de-contratar-un-concierge-puerto-rico" },
  publishedOn: "2026-11-12",
  title: {
    en: "7 questions to ask before hiring a concierge in Puerto Rico",
    es: "7 preguntas antes de contratar un concierge en Puerto Rico",
  },
  description: {
    en: "A short checklist for anyone hiring a concierge or personal assistant on the island: price, who comes, spending limits, insurance and what happens at night.",
    es: "Una lista corta para quien contrata un concierge o asistente personal en la isla: precio, quién llega, límites de gasto, seguro y qué pasa de noche.",
  },
  blocks: [
    { p: {
      en: "Concierge services in Puerto Rico range from airport greeters to membership clubs to people who will fetch your groceries. They are hard to compare because most publish little. These seven questions work on any of them, ours included.",
      es: "Los servicios de concierge en Puerto Rico van desde recibidores en el aeropuerto hasta clubes de membresía y personas que te traen el supermercado. Son difíciles de comparar porque casi todos publican poco. Estas siete preguntas sirven con cualquiera, incluido nosotros.",
    } },
    { h2: { en: "The seven questions", es: "Las siete preguntas" } },
    { ul: [
      { en: "**What does it cost, in writing, before I say yes?** If the price only appears after the work, you cannot compare. Safehubby shows the price before you confirm, and the current rates are on [the home page](/).",
        es: "**¿Cuánto cuesta, por escrito, antes de que diga que sí?** Si el precio solo aparece después del trabajo, no puedes comparar. Safehubby muestra el precio antes de que confirmes, y las tarifas al día están en [la página principal](/es)." },
      { en: "**Who exactly shows up?** Ask whether the person is vetted, and whether they are an employee or independent. Safehubby assistants are independent, vetted professionals.",
        es: "**¿Quién llega exactamente?** Pregunta si la persona está verificada y si es empleada o independiente. Los asistentes de Safehubby son profesionales independientes y verificados." },
      { en: "**Is there a spending limit?** When someone buys things for you, you want a cap that cannot be passed. With Safehubby you set it, and the assistant pays with a card issued for that task alone.",
        es: "**¿Hay un límite de gasto?** Cuando alguien compra por ti, quieres un tope que no se pueda pasar. Con Safehubby lo fijas tú, y el asistente paga con una tarjeta emitida solo para esa tarea." },
      { en: "**What is included, and what is extra?** Hours, travel, minimums and fees are where bills grow. Ask for a list.",
        es: "**¿Qué está incluido y qué es extra?** Las horas, el viaje, los mínimos y las tarifas son donde crecen las cuentas. Pide una lista." },
      { en: "**What happens at two in the morning?** Ask who answers, and whether the service is for emergencies. No concierge replaces 911.",
        es: "**¿Qué pasa a las dos de la mañana?** Pregunta quién contesta y si el servicio es para emergencias. Ningún concierge sustituye al 911." },
      { en: "**Can I cancel, and what do I get back?** Look for how unspent money is returned.",
        es: "**¿Puedo cancelar y qué me devuelven?** Fíjate en cómo se devuelve el dinero que no se gastó." },
      { en: "**Can someone else use it for a person I care about?** Many people hire help for a parent who does not use apps. Ask whether you can book for them.",
        es: "**¿Puede usarlo otra persona por alguien a quien quiero?** Mucha gente contrata ayuda para un padre que no usa apps. Pregunta si puedes reservar por esa persona." },
    ] },
    { h2: { en: "What to do with the answers", es: "Qué hacer con las respuestas" } },
    { p: {
      en: "A service that answers all seven plainly is rare. If one will not give a price or says \"it depends\" to everything, treat that as an answer. For what a personal assistant costs where prices are published, read [how much a personal assistant costs in Puerto Rico](/blog/personal-assistant-cost-puerto-rico).",
      es: "Un servicio que contesta las siete con claridad es raro. Si uno no da un precio o dice \"depende\" a todo, tómalo como respuesta. Para saber cuánto cuesta un asistente personal donde hay precios publicados, lee [cuánto cuesta un asistente personal en Puerto Rico](/es/blog/cuanto-cuesta-asistente-personal-puerto-rico).",
    } },
    { p: {
      en: "Our own answers: an assistant is {{hourly}} an hour beyond your plan's included hours, an errand starts at {{errandFrom}} plus what is bought, and a hospital day is {{hospitalDay}}. See [the assistant page](/personal-assistant-puerto-rico).",
      es: "Nuestras respuestas: un asistente cuesta {{hourly}} la hora más allá de las horas incluidas en tu plan, un mandado empieza en {{errandFrom}} más lo que se compre, y un día de hospital cuesta {{hospitalDay}}. Mira [la página del asistente](/es/asistente-personal-puerto-rico).",
    } },
  ],
  faq: [
    { q: { en: "How much does a concierge cost in Puerto Rico?", es: "¿Cuánto cuesta un concierge en Puerto Rico?" },
      a: { en: "It varies, and many services do not publish a price. Safehubby publishes its rates: an assistant is {{hourly}} an hour beyond your plan's hours and an errand starts at {{errandFrom}} plus what is bought.", es: "Varía, y muchos servicios no publican precio. Safehubby publica sus tarifas: un asistente cuesta {{hourly}} la hora más allá de las horas de tu plan y un mandado empieza en {{errandFrom}} más lo que se compre." } },
    { q: { en: "Is a concierge the same as a personal assistant?", es: "¿Un concierge es lo mismo que un asistente personal?" },
      a: { en: "The words overlap. A concierge often books and arranges things. A personal assistant can also come in person to sit with someone or do a task with you.", es: "Las palabras se solapan. Un concierge suele reservar y organizar cosas. Un asistente personal también puede ir en persona a acompañar a alguien o hacer una tarea contigo." } },
    { q: { en: "Can a concierge handle an emergency?", es: "¿Un concierge puede atender una emergencia?" },
      a: { en: "No. In an emergency, call 911 first. Safehubby is not an emergency service.", es: "No. En una emergencia, llama primero al 911. Safehubby no es un servicio de emergencia." } },
  ],
};
