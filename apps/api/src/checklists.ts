/**
 * Checklists an AI agent can hand to the person it works for. General, practical and ours: nothing here is medical or
 * legal advice, names a company, or gives a phone number or link. Each is in English and Spanish with the same shape,
 * and a test holds them to that.
 */
export type Words = { en: string; es: string };
export interface ChecklistGroup { heading: Words; items: Words[] }
export interface Checklist { slug: Words; title: Words; description: Words; groups: ChecklistGroup[]; footer: Words }
type Lang = "en" | "es";

const w = (en: string, es: string): Words => ({ en, es });
const CONTACT = "contact@safehubby.com";

export const CHECKLISTS: Checklist[] = [
  {
    slug: w("hospital-day-with-a-parent", "dia-en-el-hospital-con-un-familiar"),
    title: w("A day at the hospital with a parent or relative", "Un día en el hospital con un padre o familiar"),
    description: w("What to confirm, bring and write down, from the day before to the ride home.", "Qué confirmar, llevar y anotar, desde el día antes hasta el regreso a casa."),
    groups: [
      { heading: w("The day before", "El día antes"), items: [
        w("Confirm the appointment time, the department and the building or floor, and ask how early to arrive.", "Confirme la hora de la cita, el departamento y el edificio o piso, y pregunte con cuánta anticipación llegar."),
        w("Ask whether the patient should fast, or take or skip any medicine that morning, and write down the answer.", "Pregunte si el paciente debe estar en ayunas, o tomar u omitir alguna medicina esa mañana, y anote la respuesta."),
        w("Ask whether a companion may stay in the room, and what the visiting hours are.", "Pregunte si un acompañante puede quedarse en la habitación y cuál es el horario de visitas."),
        w("Arrange the ride both ways, with a pick-up time that leaves room for delays.", "Organice el transporte de ida y vuelta, con una hora de recogida que deje margen para retrasos."),
      ] },
      { heading: w("What to bring", "Qué llevar"), items: [
        w("Photo ID and the insurance card.", "Identificación con foto y la tarjeta del seguro."),
        w("A written list of current medicines with doses, and of any allergies.", "Una lista escrita de las medicinas actuales con sus dosis, y de cualquier alergia."),
        w("The names and phone numbers of the doctor and of one family contact.", "Los nombres y teléfonos del médico y de un contacto familiar."),
        w("Glasses, hearing aids and dentures if used, and a phone charger.", "Gafas, audífonos y dentadura si los usa, y un cargador de teléfono."),
        w("A sweater, since hospitals can be cold, plus water and a snack if the patient is allowed them, and pen and paper.", "Un suéter, porque los hospitales pueden estar fríos, además de agua y un bocadillo si el paciente puede tomarlos, y papel y lápiz."),
      ] },
      { heading: w("During the visit", "Durante la visita"), items: [
        w("Write down what the doctor says, any new medicine or change, and the date of the next appointment.", "Anote lo que dice el médico, cualquier medicina nueva o cambio, y la fecha de la próxima cita."),
        w("Ask who to call with questions afterwards, and write the number down.", "Pregunte a quién llamar con dudas después, y anote el número."),
      ] },
      { heading: w("After", "Después"), items: [
        w("See the patient safely home, with food, water and medicines within reach.", "Acompañe al paciente a casa con seguridad, con comida, agua y medicinas al alcance."),
        w("Tell the family contact what was said, and check in again later that evening.", "Cuéntele al contacto familiar lo que se dijo, y vuelva a llamar más tarde esa noche."),
      ] },
    ],
    footer: w("General information, not medical advice. Follow what the hospital and the doctor tell you.", "Información general, no es consejo médico. Siga lo que le indiquen el hospital y el médico."),
  },
  {
    slug: w("airport-with-an-older-relative", "aeropuerto-con-un-familiar-mayor"),
    title: w("Arriving at an airport with an older relative", "Llegar a un aeropuerto con un familiar mayor"),
    description: w("How to book help, what to carry, and how to be sure someone meets them at the other end.", "Cómo pedir ayuda, qué llevar y cómo asegurarse de que alguien los reciba al llegar."),
    groups: [
      { heading: w("Before the trip", "Antes del viaje"), items: [
        w("Tell the airline when booking, or as early as you can, that the traveler needs a wheelchair or help reaching the gate. It is usually free.", "Avise a la aerolínea al reservar, o lo antes posible, que el viajero necesita silla de ruedas o ayuda para llegar a la puerta. Normalmente es gratis."),
        w("Keep the ID or passport and the ticket where they are easy to reach, and carry a copy of the medicine list.", "Tenga la identificación o pasaporte y el boleto a mano, y lleve una copia de la lista de medicinas."),
        w("Pack medicines in the carry-on bag in their original containers, with extra for a delay.", "Empaque las medicinas en el equipaje de mano, en sus envases originales, con extra por si hay un retraso."),
        w("Choose a flight time that is not too early or too late, and plan more time than for a usual trip.", "Escoja una hora de vuelo que no sea ni muy temprano ni muy tarde, y calcule más tiempo que en un viaje normal."),
      ] },
      { heading: w("At the airport", "En el aeropuerto"), items: [
        w("Go to the airline counter first and confirm the help is booked.", "Vaya primero al mostrador de la aerolínea y confirme que la ayuda está reservada."),
        w("Ask where the person who helps will meet you, and stay with the traveler until they take over, if the airport allows it.", "Pregunte dónde los recibirá la persona que ayuda, y quédese con el viajero hasta que ella lo tome a su cargo, si el aeropuerto lo permite."),
        w("Mention any allergies or medical devices at security, and keep water and a snack handy.", "Mencione cualquier alergia o dispositivo médico en el control de seguridad, y tenga agua y un bocadillo a mano."),
      ] },
      { heading: w("At the other end", "Al llegar"), items: [
        w("Make sure someone is meeting the traveler, and give that person the flight number, the arrival time and the traveler's phone number.", "Asegúrese de que alguien reciba al viajero, y dele el número de vuelo, la hora de llegada y el teléfono del viajero."),
        w("Check later that they got home, ate, and have their medicines.", "Confirme más tarde que llegaron a casa, comieron y tienen sus medicinas."),
      ] },
    ],
    footer: w("General information. Airlines and airports have their own rules, so confirm with the airline.", "Información general. Las aerolíneas y los aeropuertos tienen sus propias reglas, así que confirme con la aerolínea."),
  },
  {
    slug: w("questions-before-hiring-a-concierge", "preguntas-antes-de-contratar-un-conserje"),
    title: w("Questions to ask any concierge or errand service before hiring one", "Preguntas para cualquier servicio de conserjería o mandados antes de contratarlo"),
    description: w("Eleven questions that show what a service really includes, costs and does when something goes wrong.", "Once preguntas que muestran qué incluye de verdad un servicio, cuánto cuesta y qué hace cuando algo sale mal."),
    groups: [
      { heading: w("Price and what you get", "Precio y qué recibe"), items: [
        w("What exactly is included, and what costs extra? Ask for it in writing.", "¿Qué incluye exactamente y qué cuesta extra? Pídalo por escrito."),
        w("How is the price set: by the hour, by the task, or monthly? Are there minimums, taxes, travel or service fees?", "¿Cómo se fija el precio: por hora, por tarea o mensual? ¿Hay mínimos, impuestos, cargos de viaje o de servicio?"),
        w("Can I try a small first task before committing?", "¿Puedo probar una tarea pequeña antes de comprometerme?"),
        w("Can I cancel or change a booking, and when does it start to cost money?", "¿Puedo cancelar o cambiar una reserva, y desde cuándo tiene costo?"),
      ] },
      { heading: w("Who does the work", "Quién hace el trabajo"), items: [
        w("Is the person an employee or a contractor? Were they checked, and how?", "¿La persona es empleada o contratista? ¿La verificaron y cómo?"),
        w("Can I know who is coming before they arrive?", "¿Puedo saber quién viene antes de que llegue?"),
        w("For rides: is the vehicle insured and the driver licensed?", "En los traslados: ¿el vehículo está asegurado y el conductor tiene licencia?"),
      ] },
      { heading: w("When something goes wrong", "Cuando algo sale mal"), items: [
        w("What happens if the person is late, sick or does not show up? Is there a backup?", "¿Qué pasa si la persona llega tarde, se enferma o no llega? ¿Hay un reemplazo?"),
        w("Who do I call, and how fast do they answer? Is it a person, or only a form?", "¿A quién llamo y qué tan rápido responden? ¿Es una persona o solo un formulario?"),
      ] },
      { heading: w("Your money and your information", "Su dinero y su información"), items: [
        w("If you pay for things on my behalf, do I get receipts, and how do I pay you back?", "Si pagan cosas en mi nombre, ¿recibo recibos y cómo se los reembolso?"),
        w("What do you do with my address, health details and keys, and who can see them?", "¿Qué hacen con mi dirección, datos de salud y llaves, y quién puede verlos?"),
      ] },
    ],
    footer: w(`Safehubby's own answers to these are in its brief and on safehubby.com. Questions: ${CONTACT}.`, `Las respuestas de Safehubby a estas preguntas están en su resumen y en safehubby.com. Dudas: ${CONTACT}.`),
  },
];

const langOf = (l: string | undefined): Lang => (l === "es" ? "es" : "en");

/** The checklists as a list for agents to choose from: free, no text. */
export function checklistIndex(lang: Lang) {
  return CHECKLISTS.map((c) => ({ slug: c.slug[lang], title: c.title[lang], description: c.description[lang] }));
}

export function findChecklist(slug: string, lang: Lang): Checklist | undefined {
  return CHECKLISTS.find((c) => c.slug[langOf(lang)] === slug.toLowerCase());
}

/** Plain text with empty boxes, to read, print or forward as it is. */
export function checklistText(c: Checklist, lang: Lang): string {
  const parts = [c.title[lang], "", c.description[lang], ""];
  for (const g of c.groups) {
    parts.push(g.heading[lang].toUpperCase());
    for (const i of g.items) parts.push(`- [ ] ${i[lang]}`);
    parts.push("");
  }
  parts.push(c.footer[lang].includes(CONTACT) ? c.footer[lang] : `${c.footer[lang]} Safehubby: ${CONTACT}.`);
  return parts.join("\n") + "\n";
}
