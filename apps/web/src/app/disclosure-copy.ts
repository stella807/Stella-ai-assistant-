import { PLANNING_LEAD_HOURS } from "@safehubby/core";

/**
 * The client disclosure policy: what a member agrees to understand before
 * they ask an assistant for anything. Written from what the app actually does,
 * and nothing it does not, so every line can be checked against the code. The
 * per-booking list in `CONCIERGE_DISCLOSURES` still appears at the moment of
 * booking; this is the standing version a person can read first.
 *
 * It is a plain-language disclosure, not a Terms of Service: those still need
 * a lawyer's review (docs/job-listings.md, section 6), and the footer's Terms
 * and Privacy links keep saying so.
 */
export interface DisclosureSection { heading: string; points: string[] }

export interface DisclosureCopy {
  link: string;
  title: string;
  intro: string;
  sections: DisclosureSection[];
  contact: string;
}

/** `rate` is what an extra assistant hour costs, e.g. "$45.00". */
export function disclosureCopy(lang: "en" | "es", rate: string): DisclosureCopy {
  const lead = PLANNING_LEAD_HOURS;
  if (lang === "es") {
    return {
      link: "Divulgaciones al cliente",
      title: "Política de divulgación al cliente",
      intro: "Lo que debes saber antes de pedirle algo a un asistente. Está escrito con lo que la app realmente hace.",
      sections: [
        {
          heading: "Quiénes son los asistentes",
          points: [
            "Safehubby conecta y coordina el servicio. Tu asistente es un profesional independiente y verificado, no un empleado de Safehubby.",
            "Un asistente puede rechazar una solicitud que sea insegura, ilegal o que no encaje en lo que aceptó hacer.",
            "Tu asistente no entra a tu casa. Se reúnen afuera o en un lugar público.",
          ],
        },
        {
          heading: "Qué cuesta y cuándo se cobra",
          points: [
            "Tu plan se cobra cada mes. No hay cargo por evaluación ni por consulta.",
            "Cada tarea tiene un límite de gasto que tú eliges: es lo máximo que se puede gastar en compras, nunca más. Lo que no se gaste se libera.",
            "Aparte, un cargo de servicio paga el tiempo del asistente. Lo ves antes de enviar la solicitud.",
            "El límite y el cargo se retienen en tu tarjeta al enviar la solicitud y se cobra lo que corresponde al terminar.",
          ],
        },
        {
          heading: "Horas incluidas en tu plan",
          points: [
            `Cada plan incluye horas de asistente al mes, de dos tipos: horas planificadas, para reservas que empiezan con al menos ${lead} horas de anticipación, y horas a demanda, para lo que surja antes.`,
            "Cada reserva usa un solo tipo. Cuando se acaban las horas de ese tipo, el resto de la reserva se cobra aparte, aunque queden horas del otro tipo.",
            `Las horas que pasen de lo incluido se cobran a ${rate} la hora.`,
            "Las horas incluidas se renuevan cada mes y no se acumulan. Las horas de Elite son un solo grupo.",
          ],
        },
        {
          heading: "Tu tarjeta y tu dinero",
          points: [
            "Tu asistente paga con una tarjeta emitida solo para esa tarea y limitada a tu límite de gasto. Nunca usa tu propia tarjeta.",
            "Puedes cancelar una tarea. Si una tarea no se entrega, puedes presentar una reclamación.",
            "Cancelas tu plan con un toque, desde la app. Las funciones pagadas siguen hasta el final del periodo ya pagado.",
          ],
        },
        {
          heading: "Seguridad, ubicación y sus límites",
          points: [
            "Esto no es un servicio de emergencia. En una emergencia, llama primero al 911.",
            "Tu ubicación se comparte con tu asistente solo mientras dura esa tarea.",
            "Se comparte una selfie de cada parte con la otra para confirmar con quién se reúnen.",
            "Los asistentes no dan consejos médicos, legales ni financieros, y nadie en el equipo decide si estás en condiciones de conducir.",
            "El trabajo armado solo lo hacen guardaespaldas con licencia de armas y de guardia de seguridad vigentes, y nunca se ofrece para una estancia en hospital.",
          ],
        },
        {
          heading: "Los hospitales y otros lugares tienen sus reglas",
          points: [
            "Cada hospital fija sus reglas de visita. No se garantiza la entrada a un cuarto.",
            "Antes de entregar comida o bebida a un paciente, el asistente consulta con la enfermera. Si dice que no, no se entrega.",
          ],
        },
      ],
      contact: "¿Preguntas? Escríbenos a contact@safehubby.com.",
    };
  }
  return {
    link: "Client disclosures",
    title: "Client disclosure policy",
    intro: "What to know before you ask an assistant for anything. It is written from what the app actually does.",
    sections: [
      {
        heading: "Who the assistants are",
        points: [
          "Safehubby connects and coordinates the service. Your assistant is an independent, vetted professional, not a Safehubby employee.",
          "An assistant can decline a request that is unsafe, illegal, or outside what they agreed to do.",
          "Your assistant will not enter your home. You meet outside or in a public space.",
        ],
      },
      {
        heading: "What it costs and when you are charged",
        points: [
          "Your plan is charged monthly. There is no evaluation or consultation fee.",
          "Each task has a spend cap you choose: the most that can be spent on purchases, never more. Anything unspent is released.",
          "Separately, a service fee pays your assistant for their time. You see it before you send the request.",
          "The cap and the fee are held on your card when you send the request, and what applies is charged when the task is done.",
        ],
      },
      {
        heading: "The hours your plan includes",
        points: [
          `Each plan includes assistant hours every month, of two kinds: planned hours, for bookings that start at least ${lead} hours ahead, and on-demand hours, for anything that comes up sooner.`,
          "Each booking uses one kind only. When that kind runs out, the rest of the booking is billed, even if hours of the other kind are left.",
          `Hours beyond what is included are billed at ${rate} an hour.`,
          "Included hours reset every month and do not roll over. Elite's hours are one pool.",
        ],
      },
      {
        heading: "Your card and your money",
        points: [
          "Your assistant pays with a card issued for that task alone and capped at your spend limit. They never use your own card.",
          "You can cancel a task. If a task is not delivered, you can open a dispute.",
          "You can cancel your plan in one tap, from the app. Paid features run to the end of the period you already paid for.",
        ],
      },
      {
        heading: "Safety, location and limits",
        points: [
          "This is not an emergency service. In an emergency, call 911 first.",
          "Your location is shared with your assistant only for the length of that task.",
          "A selfie from each of you is shared with the other, so you can confirm who you are meeting.",
          "Assistants do not give medical, legal or financial advice, and nobody on the team judges whether you are fit to drive.",
          "Armed work is done only by bodyguards holding current firearms and security-guard licenses, and is never offered for a hospital stay.",
        ],
      },
      {
        heading: "Hospitals and other places set their own rules",
        points: [
          "Each hospital sets its own visiting rules. Entry to a room is not guaranteed.",
          "Before handing food or drink to a patient, your assistant checks with the nurse. If the nurse says no, it is not handed over.",
        ],
      },
    ],
    contact: "Questions? Write to contact@safehubby.com.",
  };
}
