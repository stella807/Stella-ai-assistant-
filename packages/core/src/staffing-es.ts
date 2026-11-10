import type { StaffRole } from "./staffing.ts";

/**
 * Each job's name and description in Spanish.
 *
 * Kept by id beside the English in staffing.ts, and here in core rather than
 * in the web app because the server needs them too: the Spanish job pages it
 * describes to search engines must say what the application form says.
 */
export const STAFF_ROLE_ES: Record<StaffRole, { label: string; description: string }> = {
  driver: {
    label: "Chofer",
    description: "Lleva a la gente a casa. Transporte estándar o seguro, con una tarifa por viaje publicada.",
  },
  "personal-assistant": {
    label: "Asistente personal",
    description: "Ve a donde está la gente: acompaña a alguien, visita a un amigo, encárgate de una tarea de principio a fin.",
  },
  caretaker: {
    label: "Cuidador/a en el hospital",
    description: "Acompaña a un paciente durante un día de hospital: compañía, comida y cosas llevadas a la cama, y ayuda para llamar a la enfermera. Hasta 12 horas al día.",
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
  supervisor: {
    label: "Supervisor",
    description: "Dirige al equipo de campo: da seguimiento a asistentes, choferes y mensajeros durante los trabajos, interviene cuando algo sale mal y mantiene el día de cada cliente en marcha.",
  },
  bodyguard: {
    label: "Guardaespaldas",
    description: "Protege a un cliente en persona: protección cercana en eventos, en la carretera y en casa. El trabajo armado requiere tus propias licencias de armas y de guardia de seguridad (Ley 108).",
  },
};
