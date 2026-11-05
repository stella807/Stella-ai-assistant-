import { LOCATION_RETENTION_DAYS, PLANNING_LEAD_HOURS } from "@safehubby/core";

/**
 * Terms of Service and Privacy Policy, drafted from what the app actually does.
 *
 * These are DRAFTS. They are written so a lawyer has something real to mark up
 * instead of a blank page, and the page says so at the top. They are not legal
 * advice and they become the real terms only once counsel has read them. The
 * open questions are listed in docs/legal-drafts.md; where this text would
 * have to guess (who the legal entity is, which law governs, how disputes are
 * resolved), it says the answer is still to come rather than inventing one.
 */
export interface LegalSection { heading: string; paragraphs: string[] }
export interface LegalDocument {
  title: string;
  draftNotice: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  contact: string;
}

export const LEGAL_DRAFT_DATE = "November 2026";

/** `rate` is what an extra assistant hour costs, e.g. "$45.00". */
export function termsCopy(lang: "en" | "es", rate: string): LegalDocument {
  const lead = PLANNING_LEAD_HOURS;
  if (lang === "es") {
    return {
      title: "Términos de servicio",
      draftNotice: "Borrador en revisión legal. Estos términos todavía no han sido revisados por un abogado y pueden cambiar antes de que sean los definitivos.",
      updated: `Borrador de ${LEGAL_DRAFT_DATE}`,
      intro: "Estos términos explican cómo funciona Safehubby y qué esperamos de ti y de nosotros. Al crear una cuenta, suscribirte a un plan o reservar a un asistente, aceptas estos términos.",
      sections: [
        { heading: "1. Quiénes somos y qué ofrecemos", paragraphs: [
          "Safehubby es una app y un servicio de conserjería en Puerto Rico, Texas y Los Ángeles. Incluye chequeos de seguridad, compartir ubicación, SOS, reservas de viajes y asistentes personales que van en persona a hacer tareas contigo o por ti.",
          "Safehubby coordina el servicio. Tus asistentes son profesionales independientes y verificados, no empleados tuyos, y la relación entre ellos y Safehubby no te hace su patrono.",
        ] },
        { heading: "2. Tu cuenta", paragraphs: [
          "Debes tener 18 años o más, y lo comprobamos al crear la cuenta con tu fecha de nacimiento. Debes dar información verdadera, mantener segura tu contraseña y avisarnos si alguien más entra a tu cuenta. Eres responsable de lo que pase en ella.",
          "Los planes que cubren a varios clientes (por ejemplo, Premium Plus o Familia) son para las personas que el plan cubre, y la persona que contrata el plan responde por ellas.",
        ] },
        { heading: "3. El servicio y sus límites", paragraphs: [
          "Hacemos nuestro mejor esfuerzo por tener asistentes disponibles, pero no garantizamos que haya uno en cada lugar y momento. Un asistente puede rechazar una solicitud que sea insegura, ilegal o que no encaje en lo que aceptó hacer.",
          "Safehubby no es un servicio de emergencia. En una emergencia, llama primero al 911. Nuestros asistentes no dan consejos médicos, legales ni financieros.",
        ] },
        { heading: "4. Planes, precios y pagos", paragraphs: [
          "Los planes se cobran cada mes o cada año, según elijas, a la tarjeta que tienes guardada, y se renuevan automáticamente hasta que los canceles. Los precios son los que aparecen en la página de planes. Si cambian, te avisaremos antes de que el nuevo precio te aplique.",
          "Los pagos los procesa Stripe. Safehubby no guarda el número completo de tu tarjeta. Los impuestos que correspondan, como el IVU en Puerto Rico, se muestran o se incluyen según lo indique el precio.",
          `Cada plan incluye horas de asistente al mes, planificadas (reservas que empiezan con al menos ${lead} horas de anticipación) y a demanda, como se explica en las Divulgaciones al cliente. Las horas que pasen de lo incluido se cobran a ${rate} la hora. Las horas incluidas no se acumulan de un mes al siguiente.`,
          "Si un cobro falla, podemos reintentar, avisarte y limitar el servicio hasta que se resuelva.",
        ] },
        { heading: "5. Tareas, límites de gasto y cargos", paragraphs: [
          "Para cada tarea eliges un límite de gasto: lo máximo que se puede gastar en compras. Al enviar la solicitud, retenemos en tu tarjeta ese límite más el cargo de servicio. Al terminar, se cobra lo que corresponde y se libera lo que no se gastó.",
          "El asistente paga con una tarjeta emitida solo para esa tarea y limitada a tu límite. Nunca usa tu propia tarjeta. Las compras son por el costo del artículo; el cargo de servicio paga el tiempo del asistente.",
        ] },
        { heading: "6. Cancelaciones y reembolsos", paragraphs: [
          "Los detalles están en la Política de reembolsos. Puedes cancelar tu plan en cualquier momento, con un toque, desde la app. Las funciones pagadas siguen hasta el final del periodo que ya pagaste, y después tu cuenta pasa al plan gratis si está disponible o queda sin plan.",
          "Puedes cancelar una tarea antes de que se complete; lo que no se haya gastado se libera. Si una tarea no se entrega, puedes presentar una reclamación desde la app y la revisaremos. Fuera de eso, los periodos ya cobrados no se reembolsan, salvo que la ley lo exija o que te lo digamos por escrito.",
        ] },
        { heading: "7. Lo que esperamos de ti", paragraphs: [
          "Usa Safehubby de manera legal y segura. No pidas nada ilegal, peligroso o que ponga en riesgo a un asistente u otra persona. Trata con respeto a los asistentes. No intentes saltarte la plataforma para evitar cargos. Da ubicaciones y datos correctos.",
          "Tu asistente no entra a tu casa; se reúnen afuera o en un lugar público.",
        ] },
        { heading: "8. Protección armada", paragraphs: [
          "El trabajo armado solo lo hacen guardaespaldas con licencia de armas y licencia de guardia de seguridad vigentes, y solo cuando lo reservas de forma expresa. Los demás asistentes no portan armas. Nunca se ofrece para una estancia en hospital.",
          "Al reservar protección armada aceptas que personal armado te acompañe durante esa reserva, que seguirás las instrucciones de seguridad del guardaespaldas y que cumplirás la ley. Podemos rechazar o terminar una reserva armada si no es segura.",
        ] },
        { heading: "9. Servicios de terceros", paragraphs: [
          "Safehubby usa otros servicios para funcionar, entre ellos Stripe para pagos y tarjetas de tarea, un proveedor de mensajes de texto, un proveedor de correo, servicios de mapas y búsqueda de lugares, notificaciones y seguimiento de vuelos. Sus reglas aplican a lo que ellos hacen, y no controlamos esos servicios.",
        ] },
        { heading: "10. Contenido", paragraphs: [
          "La app, su diseño y su texto son de Safehubby. Lo que tú envías (notas, mensajes, fotos) sigue siendo tuyo, pero nos permites usarlo para prestarte el servicio, incluso compartirlo con tu asistente para esa tarea.",
        ] },
        { heading: "11. Suspensión y cierre", paragraphs: [
          "Podemos limitar, suspender o cerrar una cuenta que incumpla estos términos, ponga en riesgo a alguien o se use de forma fraudulenta. Tú puedes dejar de usar el servicio cuando quieras.",
        ] },
        { heading: "12. Garantías y responsabilidad", paragraphs: [
          "En la medida en que la ley lo permita, el servicio se ofrece \"tal cual\" y Safehubby no es responsable de daños indirectos o consecuentes, ni de lo que hagan terceros fuera de nuestro control. Nuestra responsabilidad total hacia ti no pasará de lo que pagaste a Safehubby en los doce meses anteriores al hecho. Nada de esto limita una responsabilidad que la ley no permita limitar.",
        ] },
        { heading: "13. Cambios a estos términos", paragraphs: [
          "Podemos actualizar estos términos. Si el cambio es importante, te avisaremos en la app o por correo antes de que aplique. Si sigues usando el servicio después, aceptas los nuevos términos.",
        ] },
        { heading: "14. Reclamaciones y ley aplicable", paragraphs: [
          "Si tienes un problema, escríbenos primero a contact@safehubby.com y haremos lo posible por resolverlo. La ley que rige estos términos y el lugar donde se presenta una reclamación se indicarán aquí cuando queden confirmados.",
        ] },
      ],
      contact: "Safehubby · contact@safehubby.com",
    };
  }
  return {
    title: "Terms of Service",
    draftNotice: "Draft under legal review. These terms have not yet been reviewed by a lawyer and may change before they are final.",
    updated: `Draft of ${LEGAL_DRAFT_DATE}`,
    intro: "These terms explain how Safehubby works and what we expect of you and of us. By creating an account, subscribing to a plan or booking an assistant, you agree to them.",
    sections: [
      { heading: "1. Who we are and what we offer", paragraphs: [
        "Safehubby is an app and concierge service in Puerto Rico, Texas and Los Angeles. It includes safety check-ins, location sharing, SOS, ride booking, and personal assistants who go in person to do tasks with you or for you.",
        "Safehubby coordinates the service. Your assistants are independent, vetted professionals, not your employees, and the arrangement between them and Safehubby does not make you their employer.",
      ] },
      { heading: "2. Your account", paragraphs: [
        "You must be 18 or older, and we check this when you create an account with your date of birth. You must give true information, keep your password secure, and tell us if someone else gets into your account. You are responsible for what happens on it.",
        "Plans that cover more than one client (such as Premium Plus or Family) are for the people the plan covers, and the person who buys the plan is responsible for them.",
      ] },
      { heading: "3. The service and its limits", paragraphs: [
        "We work to have assistants available, but we do not guarantee one in every place at every time. An assistant can decline a request that is unsafe, illegal, or outside what they agreed to do.",
        "Safehubby is not an emergency service. In an emergency, call 911 first. Our assistants do not give medical, legal or financial advice.",
      ] },
      { heading: "4. Plans, prices and payment", paragraphs: [
        "Plans are charged monthly or yearly, as you choose, to the card you have on file, and renew automatically until you cancel. Prices are those shown on the plans page. If they change, we will tell you before the new price applies to you.",
        "Payments are processed by Stripe. Safehubby does not store your full card number. Applicable taxes, such as IVU in Puerto Rico, are shown or included as the price states.",
        `Each plan includes assistant hours every month, planned (bookings that start at least ${lead} hours ahead) and on-demand, as explained in the Client Disclosures. Hours beyond what is included are billed at ${rate} an hour. Included hours do not roll over from one month to the next.`,
        "If a charge fails, we may retry it, tell you, and limit the service until it is resolved.",
      ] },
      { heading: "5. Tasks, spend caps and charges", paragraphs: [
        "For each task you choose a spend cap: the most that can be spent on purchases. When you send the request, we hold that cap plus the service fee on your card. When the task is done, what applies is charged and anything unspent is released.",
        "The assistant pays with a card issued for that task alone and limited to your cap. They never use your own card. Purchases are charged at the item's cost; the service fee pays for the assistant's time.",
      ] },
      { heading: "6. Cancellation and refunds", paragraphs: [
        "The details are in the Refund Policy. You can cancel your plan at any time, in one tap, from the app. Paid features run to the end of the period you already paid for, after which your account moves to the free plan if it is offered, or has no plan.",
        "You can cancel a task before it is completed, and anything unspent is released. If a task is not delivered, you can open a dispute in the app and we will review it. Otherwise, periods already charged are not refunded unless the law requires it or we tell you so in writing.",
      ] },
      { heading: "7. What we expect of you", paragraphs: [
        "Use Safehubby lawfully and safely. Do not ask for anything illegal or dangerous, or that puts an assistant or anyone else at risk. Treat assistants with respect. Do not go around the platform to avoid charges. Give accurate locations and details.",
        "Your assistant will not enter your home; you meet outside or in a public place.",
      ] },
      { heading: "8. Armed protection", paragraphs: [
        "Armed work is done only by bodyguards who hold current firearms and security-guard licences, and only when you book it expressly. Other assistants do not carry firearms. It is never offered for a hospital stay.",
        "By booking armed protection you agree that armed personnel will be with you during that booking, that you will follow the bodyguard's safety instructions, and that you will obey the law. We may refuse or end an armed booking that is not safe.",
      ] },
      { heading: "9. Third-party services", paragraphs: [
        "Safehubby relies on other services to work, including Stripe for payments and task cards, a text-message provider, an email provider, map and place-search services, push notifications and flight tracking. Their rules govern what they do, and we do not control them.",
      ] },
      { heading: "10. Content", paragraphs: [
        "The app, its design and its text belong to Safehubby. What you send (notes, messages, photos) stays yours, but you let us use it to provide the service to you, including sharing it with your assistant for that task.",
      ] },
      { heading: "11. Suspension and ending", paragraphs: [
        "We may limit, suspend or close an account that breaks these terms, puts someone at risk, or is used fraudulently. You can stop using the service whenever you like.",
      ] },
      { heading: "12. Warranties and liability", paragraphs: [
        "To the extent the law allows, the service is provided \"as is\", and Safehubby is not liable for indirect or consequential damages, or for what third parties do outside our control. Our total liability to you will not exceed what you paid Safehubby in the twelve months before the event. None of this limits liability that the law does not allow to be limited.",
      ] },
      { heading: "13. Changes to these terms", paragraphs: [
        "We may update these terms. If a change is material, we will tell you in the app or by email before it applies. If you keep using the service afterward, you accept the new terms.",
      ] },
      { heading: "14. Claims and governing law", paragraphs: [
        "If you have a problem, write to us first at contact@safehubby.com and we will do our best to resolve it. The law that governs these terms, and where a claim is brought, will be stated here once confirmed.",
      ] },
    ],
    contact: "Safehubby · contact@safehubby.com",
  };
}

export function privacyCopy(lang: "en" | "es"): LegalDocument {
  const days = LOCATION_RETENTION_DAYS;
  if (lang === "es") {
    return {
      title: "Política de privacidad",
      draftNotice: "Borrador en revisión legal. Esta política todavía no ha sido revisada por un abogado y puede cambiar antes de que sea la definitiva.",
      updated: `Borrador de ${LEGAL_DRAFT_DATE}`,
      intro: "Safehubby maneja datos sensibles, como dónde estás y qué compras. Esta política dice qué guardamos, para qué, con quién lo compartimos y qué puedes decidir tú. Tu ubicación e historial de bebidas son tuyos. Nunca se venden y nunca se usan para publicidad dirigida.",
      sections: [
        { heading: "1. Qué datos guardamos", paragraphs: [
          "Cuenta: tu nombre, correo, una versión protegida de tu contraseña (nunca la guardamos tal cual) y el lugar que llamas casa. Al crear la cuenta te pedimos la fecha de nacimiento solo para comprobar que tienes 18 años o más; no la guardamos, solo que se comprobó.",
          "Ubicación: tu ubicación cuando usas funciones que la necesitan, como compartir ubicación, chequeos, SOS o una tarea con un asistente.",
          "Uso de la app: tus chequeos, tus contactos de guardianes, tu historial de bebidas y estimaciones relacionadas, y tus tareas (la nota, el lugar, mensajes, mensajes de voz, recibos y fotos).",
          "Pagos: la marca y los últimos cuatro dígitos de tu tarjeta y una referencia de Stripe. El número completo de la tarjeta lo maneja Stripe y no pasa por nuestros servidores.",
          "Verificación: si te unes a un plan para personas de 65 años o más, una foto de tu identificación, que revisa nuestro equipo. Si das tu teléfono, lo usamos para alertas de texto.",
          "Personas que solicitan trabajo: su solicitud, currículo, documentos como seguro y licencias, el consentimiento para verificar antecedentes y, si se les contrata, los datos bancarios para pagarles, que se guardan cifrados.",
        ] },
        { heading: "2. Para qué los usamos", paragraphs: [
          "Para prestarte el servicio: avisar a tus guardianes, despachar a un asistente, cobrar tu plan, darte soporte, prevenir fraude y mantener la app segura y funcionando. No vendemos tus datos ni los usamos para publicidad dirigida.",
        ] },
        { heading: "3. Con quién los compartimos", paragraphs: [
          "Con las personas que tú eliges: tus guardianes ven tu ubicación y tus chequeos según lo que les compartas.",
          "Con tu asistente, solo lo necesario para esa tarea: tu ubicación mientras dura la tarea y, para que cada parte confirme con quién se reúne, una selfie de cada uno.",
          "Con los servicios que usamos para operar: Stripe (pagos y tarjetas de tarea), un proveedor de mensajes de texto, un proveedor de correo, servicios de mapas y búsqueda de lugares, notificaciones, seguimiento de vuelos y nuestro proveedor de alojamiento. Reciben solo lo que necesitan para su función.",
          "Con las autoridades, cuando la ley lo exija o para proteger la seguridad de alguien. Si Safehubby se vendiera o se fusionara, los datos pasarían al nuevo dueño bajo estas mismas reglas.",
        ] },
        { heading: "4. Tu ubicación", paragraphs: [
          `Tu ubicación se comparte solo como tú lo decides. Con un asistente, solo mientras dura la tarea. El historial de ubicación se borra después de ${days} días.`,
        ] },
        { heading: "5. Cuánto tiempo los guardamos", paragraphs: [
          `Ubicación: ${days} días. Los datos de tu cuenta, mientras la tengas. Los registros de pagos, tareas y cargos se guardan el tiempo que exijan la contabilidad y las leyes que apliquen, o mientras haga falta para resolver una reclamación.`,
        ] },
        { heading: "6. Cómo los protegemos", paragraphs: [
          "Usamos conexiones cifradas, cifrado de los datos más sensibles (como la ubicación y los datos bancarios de pago) y acceso limitado según el rol de cada persona del equipo. Ningún sistema es perfecto, pero tratamos esta información como sensible.",
        ] },
        { heading: "7. Tus opciones", paragraphs: [
          "Puedes pedirnos ver, corregir o borrar tus datos escribiendo a contact@safehubby.com. Puedes dejar de recibir textos o correos con las opciones de cada mensaje o en tu cuenta, y dejar de compartir ubicación cuando quieras.",
          "Según donde vivas, la ley (por ejemplo, la de California) puede darte derechos adicionales sobre tus datos. Escríbenos y los atenderemos.",
        ] },
        { heading: "8. Menores", paragraphs: [
          "Safehubby no es para menores de 18 años y no recopilamos datos de ellos a propósito.",
        ] },
        { heading: "9. Cambios a esta política", paragraphs: [
          "Si cambiamos esta política de forma importante, te avisaremos en la app o por correo antes de que aplique.",
        ] },
      ],
      contact: "Safehubby · contact@safehubby.com",
    };
  }
  return {
    title: "Privacy Policy",
    draftNotice: "Draft under legal review. This policy has not yet been reviewed by a lawyer and may change before it is final.",
    updated: `Draft of ${LEGAL_DRAFT_DATE}`,
    intro: "Safehubby handles sensitive data, like where you are and what you buy. This policy says what we keep, why, who we share it with and what you can decide. Your location and drink history are yours. They are never sold and never used for ad targeting.",
    sections: [
      { heading: "1. What we keep", paragraphs: [
        "Account: your name, email, a protected version of your password (we never store it as typed) and the place you call home. When you sign up we ask your date of birth only to check you are 18 or older; we do not keep it, only that the check was done.",
        "Location: your location when you use features that need it, such as location sharing, check-ins, SOS, or a task with an assistant.",
        "Using the app: your check-ins, your guardian contacts, your drink history and related estimates, and your tasks (the note, the place, messages, voice messages, receipts and photos).",
        "Payments: your card's brand and last four digits and a Stripe reference. The full card number is handled by Stripe and does not pass through our servers.",
        "Verification: if you join a plan for people 65 and over, a photo of your ID, which our team reviews. If you give a phone number, we use it for text alerts.",
        "Job applicants: their application, résumé, documents such as insurance and licences, their consent to a background check and, if hired, the bank details used to pay them, which are stored encrypted.",
      ] },
      { heading: "2. Why we use it", paragraphs: [
        "To provide the service: alerting your guardians, dispatching an assistant, billing your plan, giving you support, preventing fraud, and keeping the app safe and running. We do not sell your data or use it for targeted advertising.",
      ] },
      { heading: "3. Who we share it with", paragraphs: [
        "With the people you choose: your guardians see your location and check-ins according to what you share with them.",
        "With your assistant, only what that task needs: your location for the length of the task and, so each side can confirm who they are meeting, a selfie from each of you.",
        "With the services we use to operate: Stripe (payments and task cards), a text-message provider, an email provider, map and place-search services, push notifications, flight tracking and our hosting provider. They receive only what they need to do their part.",
        "With authorities when the law requires it or to protect someone's safety. If Safehubby is sold or merged, the data would pass to the new owner under these same rules.",
      ] },
      { heading: "4. Your location", paragraphs: [
        `Your location is shared only as you decide. With an assistant, only for the length of the task. Location history is deleted after ${days} days.`,
      ] },
      { heading: "5. How long we keep it", paragraphs: [
        `Location: ${days} days. Your account data, for as long as you have an account. Payment, task and charge records are kept as long as accounting and applicable law require, or as long as needed to resolve a claim.`,
      ] },
      { heading: "6. How we protect it", paragraphs: [
        "We use encrypted connections, encryption of the most sensitive data (such as location and payout bank details) and access limited by each team member's role. No system is perfect, but we treat this information as sensitive.",
      ] },
      { heading: "7. Your choices", paragraphs: [
        "You can ask us to show, correct or delete your data by writing to contact@safehubby.com. You can stop text or email messages with the options in each message or in your account, and stop sharing your location whenever you like.",
        "Depending on where you live, the law (for example California's) may give you additional rights over your data. Write to us and we will honor them.",
      ] },
      { heading: "8. Children", paragraphs: [
        "Safehubby is not for anyone under 18 and we do not knowingly collect data from them.",
      ] },
      { heading: "9. Changes to this policy", paragraphs: [
        "If we change this policy in a material way, we will tell you in the app or by email before it applies.",
      ] },
    ],
    contact: "Safehubby · contact@safehubby.com",
  };
}

/** The refund policy, written from how the app actually handles money; a draft until counsel has read it. */
export function refundCopy(lang: "en" | "es"): LegalDocument {
  if (lang === "es") {
    return {
      title: "Política de reembolsos",
      draftNotice: "Borrador en revisión legal. Esta política describe cómo funciona hoy la app y todavía no ha sido revisada por un abogado.",
      updated: `Borrador de ${LEGAL_DRAFT_DATE}`,
      intro: "Qué se te devuelve, cuándo y cómo, según cómo la app maneja realmente el dinero.",
      sections: [
        { heading: "1. Tu plan", paragraphs: [
          "No hay prueba gratis. Un plan de pago se cobra cuando empieza. Si te uniste antes del lanzamiento, el primer cobro es el día en que el servicio empieza, no antes.",
          "Puedes cancelar en cualquier momento, con un toque, desde la app. Las funciones pagadas siguen hasta el final del periodo que ya pagaste. La parte que no uses de un periodo ya cobrado no se reembolsa, salvo que la ley lo exija o te lo digamos por escrito.",
          "Si subes a un plan más caro a mitad de periodo, la parte sin usar de lo que ya pagaste se te acredita contra el nuevo plan. Un cambio a un plan más barato pasa por el equipo de ayuda y no genera un reembolso.",
        ] },
        { heading: "2. Tareas", paragraphs: [
          "Al enviar una tarea, retenemos en tu tarjeta el límite de gasto y el cargo de servicio. Si cancelas la tarea antes de que se complete, o el asistente no la acepta, se libera todo y no se cobra nada.",
          "Cuando la tarea termina, se cobra solo lo que se gastó de verdad y el cargo de servicio. Lo que sobre del límite se libera.",
        ] },
        { heading: "3. Si una tarea no se entrega", paragraphs: [
          "Si una tarea aparece como completada pero no se entregó, o el asistente se quedó con el dinero, puedes abrir una reclamación desde la app. Si la aprobamos, se reembolsa completo el cobro de esa tarea.",
        ] },
        { heading: "4. Salidas del Wingman Club", paragraphs: [
          "Si cancelas tu lugar en una salida con cargo extra antes de que el club confirme el día, se te reembolsa ese extra completo. Si el club cancela la salida, se reembolsa a todos los que pagaron.",
        ] },
        { heading: "5. Saldo prepagado", paragraphs: [
          "Un saldo cargado con ATH Móvil se puede devolver. Un saldo cargado con criptomonedas no se reembolsa automáticamente.",
        ] },
        { heading: "6. Cómo recibes el reembolso", paragraphs: [
          "Los reembolsos van a la tarjeta con la que pagaste, a través de Stripe. Cuánto tarda en aparecer depende de tu banco.",
          "Si te cobramos algo por error, escríbenos y lo corregimos.",
        ] },
        { heading: "7. Cómo pedirlo", paragraphs: [
          "Para una tarea, abre una reclamación desde la app. Para cualquier otra cosa, escribe a contact@safehubby.com con lo que pasó y la fecha del cobro.",
        ] },
      ],
      contact: "Safehubby · contact@safehubby.com",
    };
  }
  return {
    title: "Refund Policy",
    draftNotice: "Draft under legal review. This policy describes how the app works today and has not yet been reviewed by a lawyer.",
    updated: `Draft of ${LEGAL_DRAFT_DATE}`,
    intro: "What is returned to you, when and how, based on how the app actually handles money.",
    sections: [
      { heading: "1. Your plan", paragraphs: [
        "There is no free trial. A paid plan is charged when it starts. If you joined before launch, your first charge is the day the service starts, not before.",
        "You can cancel at any time, in one tap, from the app. Paid features run to the end of the period you already paid for. The part you do not use of a period already charged is not refunded, unless the law requires it or we tell you so in writing.",
        "If you move up to a more expensive plan part-way through a period, the unused part of what you already paid is credited toward the new plan. A move to a cheaper plan goes through the help desk and does not produce a refund.",
      ] },
      { heading: "2. Tasks", paragraphs: [
        "When you send a task, we hold your spend cap and the service fee on your card. If you cancel the task before it is completed, or the assistant does not accept it, the whole hold is released and nothing is charged.",
        "When the task is done, only what was actually spent and the service fee are charged. Anything left of the cap is released.",
      ] },
      { heading: "3. If a task is not delivered", paragraphs: [
        "If a task shows as completed but was not delivered, or the assistant kept the money, you can open a dispute in the app. If we uphold it, the full charge for that task is refunded.",
      ] },
      { heading: "4. Wingman Club outings", paragraphs: [
        "If you cancel your place in an outing that carries an extra charge before the club locks the day in, the extra is refunded in full. If the club calls the outing off, everyone who paid is refunded.",
      ] },
      { heading: "5. Prepaid balance", paragraphs: [
        "A balance loaded with ATH Móvil can be sent back. A balance loaded with crypto is not refunded automatically.",
      ] },
      { heading: "6. How you get the refund", paragraphs: [
        "Refunds go back to the card you paid with, through Stripe. How long it takes to show up depends on your bank.",
        "If we charged you something by mistake, write to us and we will correct it.",
      ] },
      { heading: "7. How to ask", paragraphs: [
        "For a task, open a dispute in the app. For anything else, write to contact@safehubby.com with what happened and the date of the charge.",
      ] },
    ],
    contact: "Safehubby · contact@safehubby.com",
  };
}
