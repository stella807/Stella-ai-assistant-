/**
 * The Careers application, in English and Spanish. Role names, descriptions
 * and benefits come from the server in English; Spanish versions are kept
 * here by id, falling back to the English text for anything new.
 */
import type { Lang } from "./ask-copy.ts";

export const ROLE_ES: Record<string, { label: string; description: string }> = {
  driver: {
    label: "Chofer",
    description: "Lleva a la gente a casa. Transporte estándar o seguro, con una tarifa por viaje publicada.",
  },
  "personal-assistant": {
    label: "Asistente personal",
    description: "Ve a donde está la gente: acompaña a alguien, visita a un amigo, encárgate de una tarea de principio a fin.",
  },
  "errand-runner": {
    label: "Mensajero de encargos",
    description: "Recogidos y encargos cortos. La forma más rápida de entrar al equipo, con horario flexible.",
  },
  "social-media-manager": {
    label: "Encargado de redes sociales",
    description: "Llena el lanzamiento: maneja las cuentas, la fiesta de lanzamiento, el boletín y los referidos que traen a los primeros clientes.",
  },
  secretary: {
    label: "Secretario/a",
    description: "Mantén la operación en marcha: citas, papeleo de solicitantes, correo de clientes y apoyo de despacho.",
  },
  lawyer: {
    label: "Abogado/a",
    description: "Redacta y revisa contratos: acuerdos de empleo, términos de servicio, políticas de privacidad, acuerdos con choferes y documentos de cumplimiento.",
  },
  "web-developer": {
    label: "Desarrollador/a web",
    description: "Construye y mantén la app de clientes, el portal de asistentes y el API en el que ambos funcionan.",
  },
  physician: {
    label: "Médico (asesor médico de Elite)",
    description: "Evalúa y supervisa la red de médicos concierge para Elite, y asesora al equipo sobre lo que puede ofrecer con seguridad. Asesor del equipo, no médico de cabecera de Safehubby.",
  },
  nurse: {
    label: "Enfermero/a (coordinación de Elite)",
    description: "Revisa las solicitudes de miembros Elite antes de que lleguen al equipo, coordina con la red de referidos y ayuda a decidir cuándo algo es para un médico o para el 911. Coordinación, no cuidado directo.",
  },
  "wingman-club-coordinator": {
    label: "Coordinador/a del Wingman Club",
    description: "Asistente personal del dueño dedicado al Wingman Club: elegir y negociar la experiencia de cada mes, la relación con los lugares y la revelación.",
  },
};

export const BENEFIT_ES: Record<string, { label: string; detail: string }> = {
  "liability-insurance": {
    label: "Seguro de responsabilidad desde el primer día",
    detail: "Todo el que contratamos está cubierto mientras trabaja, sin costo para ti. Vas a casas de desconocidos y a carros ajenos; ese riesgo lo carga la compañía, no tú.",
  },
  "gas-stipend": {
    label: "$10 a la semana para gasolina hasta el lanzamiento",
    detail: "Antes del lanzamiento no hay viajes porque todavía no hay clientes. Los choferes que acepten una oferta y sigan en el equipo hasta entonces reciben ayuda para gasolina cada semana; no deberías perder dinero por esperarnos.",
  },
  "published-rates": {
    label: "La tarifa se publica antes de que solicites",
    detail: "Lo que paga un viaje o una tarea está por escrito y a la vista desde el principio, y el margen de la compañía se suma encima, nunca se resta.",
  },
};

export const CAREERS = {
  en: {
    back: "← Back",
    title: "Work with Safehubby",
    lead: "We're hiring ahead of launch. Pick the role that fits and tell us a little about yourself — the rate is published before you apply. A résumé is welcome but optional: the sentence or two about your experience below is what actually gets read either way.",
    youGet: "What you get",
    hiring: (n: number) => `Hiring now: ${n} ${n === 1 ? "person" : "people"}`,
    notHiring: "Not hiring right now — you can still apply to be considered later.",
    name: "Your name", email: "Email", phone: "Phone", city: "City", state: "State",
    experience: "Relevant experience",
    experienceHint: "A sentence or two. Looking after people counts, whether or not it was a job.",
    resume: "Résumé (optional)", attached: "Attached:",
    tooBig: "That file is too large — try a smaller PDF or a more compressed photo.",
    unreadable: "Could not read that file — try again.",
    hours: "Hours a week you're looking for",
    consent: "I consent to a background check.",
    consentPeople: "This is in-person work with people who may be vulnerable, so it is required for every role.",
    consentAll: "Required for every role.",
    apply: "Apply",
    loadFailed: "Could not load the open roles.",
    failed: "Something went wrong",
    received: "Application received",
    keep: "Keep this reference — it is how you check on or withdraw your application.",
    reference: "Your reference",
    done: "Back",
  },
  es: {
    back: "← Atrás",
    title: "Trabaja con Safehubby",
    lead: "Estamos contratando antes del lanzamiento. Escoge el puesto que te queda y cuéntanos un poco de ti; la tarifa se publica antes de que solicites. Tu resumé es bienvenido pero opcional: lo que de verdad leemos es la oración o dos sobre tu experiencia.",
    youGet: "Lo que recibes",
    hiring: (n: number) => `Contratando ahora: ${n} ${n === 1 ? "persona" : "personas"}`,
    notHiring: "No estamos contratando ahora mismo; igual puedes solicitar para que te consideremos más adelante.",
    name: "Tu nombre", email: "Correo electrónico", phone: "Teléfono", city: "Ciudad", state: "Estado",
    experience: "Experiencia relevante",
    experienceHint: "Una oración o dos. Cuidar de otras personas cuenta, haya sido un trabajo o no.",
    resume: "Resumé (opcional)", attached: "Adjunto:",
    tooBig: "Ese archivo es muy grande; prueba con un PDF más pequeño o una foto más comprimida.",
    unreadable: "No pudimos leer ese archivo; inténtalo de nuevo.",
    hours: "Horas a la semana que buscas",
    consent: "Autorizo una verificación de antecedentes.",
    consentPeople: "Es trabajo en persona con gente que puede ser vulnerable, así que es requisito para todos los puestos.",
    consentAll: "Es requisito para todos los puestos.",
    apply: "Solicitar",
    loadFailed: "No pudimos cargar los puestos disponibles.",
    failed: "Algo salió mal",
    received: "Solicitud recibida",
    keep: "Guarda esta referencia: con ella puedes ver o retirar tu solicitud.",
    reference: "Tu referencia",
    done: "Atrás",
  },
} as const;

export const careersWords = (lang: Lang) => CAREERS[lang];

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The driver application, in English and Spanish. */
export const DRIVE = {
  en: {
    title: "Drive for Safehubby", back: "Back", tier: "Which tier", standard: "Standard", secure: "Secure transport",
    secureNote: "For licensed protective-services, military, or law-enforcement professionals. Requires a verifiable protective-services licence in addition to everything below.",
    standardNote: "A driving licence, a roadworthy vehicle, and a background check.",
    pay: "Pay",
    payLine: (base: number, mile: number, minute: number) =>
      `${usd(base)} per trip, plus ${usd(mile)}/mile and ${usd(minute)}/minute — a base, plus what the trip actually costs in distance and time, not one flat number for every trip length.`,
    example: (cents: number) => `Example: a 5-mile, 15-minute trip pays about ${usd(cents)}.`,
    secureWhy: " Higher than standard by design — it reflects the real, ongoing cost of a licensed protective-services driver's insurance and training, not a premium for the job sounding riskier.",
    notLive: "Nobody is dispatched from this list yet — see the note after you apply. This is the rate that will apply once driving for Safehubby is live, published now rather than decided later.",
    aboutYou: "About you", fullName: "Full name",
    licence: "Driver's licence", licenceNumber: "Licence number", expiry: "Expiry date", yearsDriving: "Years driving",
    vehicle: "Vehicle", make: "Make", model: "Model", year: "Year", plate: "Licence plate",
    protective: "Protective-services licence",
    protectiveNote: "Required for this tier. Safehubby does not itself verify whether a given state's licence is genuine — a background-check vendor and legal counsel do — but the application cannot omit the field that makes that check possible.",
    issuingState: "Issuing state", yearsProtective: "Years of protective, military, or law-enforcement experience",
    resumeTitle: "Résumé (optional)", resumeNote: "A valid licence and a roadworthy vehicle are what the job needs — this is optional.",
    attach: "Attach a file",
    consent: "I consent to a background check, including driving record and, for secure transport, licence verification.",
    submit: "Submit application", failed: "Could not submit that application",
    yourId: "Your application id is", saveIt: "Save it — it is the only way to check on your application or withdraw it later.",
    followUp: "A background check is required before approval. We'll follow up at the email you gave.",
  },
  es: {
    title: "Maneja para Safehubby", back: "Atrás", tier: "Qué tipo", standard: "Estándar", secure: "Transporte seguro",
    secureNote: "Para profesionales con licencia de servicios de protección, militares o de la policía. Requiere una licencia de servicios de protección verificable además de todo lo de abajo.",
    standardNote: "Licencia de conducir, un vehículo en buenas condiciones y una verificación de antecedentes.",
    pay: "Pago",
    payLine: (base: number, mile: number, minute: number) =>
      `${usd(base)} por viaje, más ${usd(mile)} por milla y ${usd(minute)} por minuto: una base, más lo que el viaje realmente cuesta en distancia y tiempo, no una sola cifra para cualquier viaje.`,
    example: (cents: number) => `Ejemplo: un viaje de 5 millas y 15 minutos paga cerca de ${usd(cents)}.`,
    secureWhy: " Más alto que el estándar a propósito: refleja el costo real del seguro y el entrenamiento de un chofer de protección con licencia, no un extra porque el trabajo suene más arriesgado.",
    notLive: "Todavía no se despacha a nadie de esta lista; mira la nota después de solicitar. Esta es la tarifa que aplicará cuando manejar para Safehubby esté activo, publicada ahora y no decidida después.",
    aboutYou: "Sobre ti", fullName: "Nombre completo",
    licence: "Licencia de conducir", licenceNumber: "Número de licencia", expiry: "Fecha de vencimiento", yearsDriving: "Años manejando",
    vehicle: "Vehículo", make: "Marca", model: "Modelo", year: "Año", plate: "Tablilla",
    protective: "Licencia de servicios de protección",
    protectiveNote: "Requerida para este tipo. Safehubby no verifica por sí misma si la licencia de un estado es genuina; eso lo hacen una compañía de verificación de antecedentes y un abogado, pero la solicitud necesita el dato que hace posible esa verificación.",
    issuingState: "Estado que la emitió", yearsProtective: "Años de experiencia en protección, militar o policía",
    resumeTitle: "Resumé (opcional)", resumeNote: "Lo que el trabajo necesita es una licencia válida y un vehículo en buenas condiciones; esto es opcional.",
    attach: "Adjuntar un archivo",
    consent: "Autorizo una verificación de antecedentes, incluido mi historial de manejo y, para transporte seguro, la verificación de la licencia.",
    submit: "Enviar solicitud", failed: "No pudimos enviar la solicitud",
    yourId: "Tu número de solicitud es", saveIt: "Guárdalo: es la única forma de ver o retirar tu solicitud más adelante.",
    followUp: "Se requiere una verificación de antecedentes antes de aprobarte. Te escribiremos al correo que nos diste.",
  },
} as const;
