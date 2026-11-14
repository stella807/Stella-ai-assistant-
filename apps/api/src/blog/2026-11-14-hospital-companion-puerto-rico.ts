import type { Article } from "../blog.ts";

export const article: Article = {
  slug: { en: "hospital-companion-puerto-rico", es: "acompanante-de-hospital-puerto-rico" },
  publishedOn: "2026-11-14",
  title: {
    en: "A parent in a Puerto Rico hospital and you cannot be there",
    es: "Tu papá o mamá en un hospital de Puerto Rico y no puedes estar",
  },
  description: {
    en: "What a hospital companion does and does not do, what to ask before you hire one, how to stay informed from far away, and what a day costs.",
    es: "Qué hace y qué no hace un acompañante de hospital, qué preguntar antes de contratar uno, cómo mantenerte al tanto desde lejos y cuánto cuesta un día.",
  },
  blocks: [
    { p: {
      en: "Many families in Puerto Rico have someone who lives in Florida, Texas or New York. When a parent is admitted to the hospital, that person feels it most: you want to be in the room, and you are a flight away. A hospital companion is a way to have someone there until you arrive, or on the days you cannot.",
      es: "Muchas familias en Puerto Rico tienen a alguien que vive en Florida, Texas o Nueva York. Cuando hospitalizan a un padre, esa persona es la que más lo siente: quieres estar en el cuarto y estás a un vuelo de distancia. Un acompañante de hospital es una forma de tener a alguien ahí hasta que llegues, o los días que no puedes.",
    } },
    { h2: { en: "What a hospital companion does", es: "Qué hace un acompañante de hospital" } },
    { ul: [
      { en: "**Stays in the room.** Your parent is not alone when they wake up, when the food comes or when the hours get long.",
        es: "**Se queda en el cuarto.** Tu papá o tu mamá no está solo cuando despierta, cuando llega la comida o cuando las horas se hacen largas." },
      { en: "**Calls the nurse.** If something is needed, the companion presses the button or walks to the station. They do not do the nurse's work.",
        es: "**Llama a la enfermera.** Si hace falta algo, el acompañante toca el botón o camina a la estación. No hace el trabajo de la enfermera." },
      { en: "**Brings small things.** A charger, a blanket, a juice, reading glasses left at home.",
        es: "**Trae cosas pequeñas.** Un cargador, una frisa, un jugo, los espejuelos que se quedaron en casa." },
      { en: "**Keeps you informed.** A message when the doctor has come by, when a test is scheduled, when your parent is sleeping.",
        es: "**Te mantiene al tanto.** Un mensaje cuando pasó el médico, cuando hay un estudio programado, cuando tu papá o tu mamá está durmiendo." },
    ] },
    { h2: { en: "What a companion does not do", es: "Qué no hace un acompañante" } },
    { p: {
      en: "A companion is not a nurse or a doctor. They do not give medicine, move a patient who should not be moved, or make medical decisions. Those belong to the hospital staff and to the family. If you need medical care at the bedside, ask the hospital about a private-duty nurse. That is a different service with a different license.",
      es: "Un acompañante no es enfermero ni médico. No da medicamentos, no mueve a un paciente que no debe moverse y no toma decisiones médicas. Eso les toca al personal del hospital y a la familia. Si necesitas cuidado médico al lado de la cama, pregunta en el hospital por una enfermera privada. Ese es otro servicio, con otra licencia.",
    } },
    { h2: { en: "What to ask before you hire one", es: "Qué preguntar antes de contratar uno" } },
    { ul: [
      { en: "Who exactly is coming, and was their identity checked?",
        es: "¿Quién viene exactamente, y se verificó su identidad?" },
      { en: "What is the price for the day, and what happens if the stay runs longer?",
        es: "¿Cuál es el precio del día, y qué pasa si la estadía se alarga?" },
      { en: "Can they buy things for the patient, and who sets the limit on what is spent?",
        es: "¿Puede comprar cosas para el paciente, y quién fija el límite de lo que se gasta?" },
      { en: "How will I hear from them during the day?",
        es: "¿Cómo voy a saber de ellos durante el día?" },
      { en: "What do they do if something looks wrong?",
        es: "¿Qué hacen si algo no se ve bien?" },
    ] },
    { h2: { en: "How to stay informed from far away", es: "Cómo mantenerte al tanto desde lejos" } },
    { ul: [
      { en: "Ask the hospital how it shares information with family, and get your name on the list of people the staff may speak to. The patient usually has to agree.",
        es: "Pregunta en el hospital cómo comparte información con la familia, y pide que pongan tu nombre en la lista de personas con quienes el personal puede hablar. Casi siempre el paciente tiene que estar de acuerdo." },
      { en: "Pick one relative to be the contact, so the staff are not answering five calls about the same thing.",
        es: "Escojan a un familiar como contacto, para que el personal no conteste cinco llamadas sobre lo mismo." },
      { en: "Write down the questions for the doctor before the visit, and ask the person in the room to write down the answers.",
        es: "Anota las preguntas para el médico antes de la visita, y pídele a quien esté en el cuarto que anote las respuestas." },
      { en: "Keep a list of medicines and allergies where the person in the room can show it.",
        es: "Ten una lista de medicamentos y alergias donde quien esté en el cuarto pueda enseñarla." },
    ] },
    { h2: { en: "What it costs with Safehubby", es: "Cuánto cuesta con Safehubby" } },
    { p: {
      en: "A Safehubby caretaker stays with a patient for a full hospital day, up to 12 hours, for {{hospitalDay}}. For a shorter visit, assistant time is {{hourly}} an hour. If the only need is one thing brought to the room, an errand starts at {{errandFrom}} plus what is bought, under a spending limit you set. The caretaker is not a medical professional, and Safehubby is not an emergency service.",
      es: "Un cuidador de Safehubby se queda con un paciente un día completo de hospital, hasta 12 horas, por {{hospitalDay}}. Para una visita más corta, el tiempo de asistente cuesta {{hourly}} la hora. Si solo hace falta que lleven una cosa al cuarto, un mandado empieza en {{errandFrom}} más lo que se compre, con un límite de gasto que tú fijas. El cuidador no es un profesional médico, y Safehubby no es un servicio de emergencia.",
    } },
    { p: {
      en: "For how these prices compare with paying by the hour or by the month, read [how much a personal assistant costs in Puerto Rico](/blog/personal-assistant-cost-puerto-rico). All prices are on [the home page](/).",
      es: "Para ver cómo se comparan estos precios con pagar por hora o por mes, lee [cuánto cuesta un asistente personal en Puerto Rico](/es/blog/cuanto-cuesta-asistente-personal-puerto-rico). Todos los precios están en [la página principal](/es).",
    } },
  ],
  faq: [
    { q: { en: "Can a hospital companion give my parent their medicine?", es: "¿Un acompañante de hospital puede darle los medicamentos a mi papá o mi mamá?" },
      a: { en: "No. A companion is not a nurse. Medicine is given by the hospital staff. The companion can call the nurse when it is time or when something is needed.", es: "No. Un acompañante no es enfermero. Los medicamentos los da el personal del hospital. El acompañante puede llamar a la enfermera cuando sea la hora o cuando haga falta algo." } },
    { q: { en: "How much does a hospital companion cost in Puerto Rico?", es: "¿Cuánto cuesta un acompañante de hospital en Puerto Rico?" },
      a: { en: "With Safehubby, a full hospital day of up to 12 hours is {{hospitalDay}}. Shorter visits are {{hourly}} an hour.", es: "Con Safehubby, un día completo de hospital de hasta 12 horas cuesta {{hospitalDay}}. Las visitas más cortas cuestan {{hourly}} la hora." } },
    { q: { en: "Can I arrange it from the United States?", es: "¿Puedo coordinarlo desde Estados Unidos?" },
      a: { en: "Yes. You ask for it in the Safehubby app or by WhatsApp, set the spending limit, and get messages during the day.", es: "Sí. Lo pides en la app de Safehubby o por WhatsApp, fijas el límite de gasto y recibes mensajes durante el día." } },
  ],
};
