/**
 * The emails an applicant gets: that their application arrived, what was
 * decided, and that they are hired.
 *
 * An application does not record a language, and Puerto Rico reads both, so
 * each message is English followed by Spanish rather than a guess. The words
 * are plain on purpose: nothing here promises a start date, a rate or a shift
 * the person has not been told in person.
 */

export type ApplicantEmailKind = "received" | "under-review" | "approved" | "rejected" | "hired";

export interface ApplicantEmailInput {
  kind: ApplicantEmailKind;
  /** The applicant's name as they typed it. */
  name: string;
  /** What they applied for, e.g. "Personal assistant" or "Driver". */
  roleLabel: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

const SUBJECTS: Record<ApplicantEmailKind, string> = {
  received: "We received your application · Recibimos tu solicitud",
  "under-review": "Your application is being reviewed · Estamos revisando tu solicitud",
  approved: "Good news about your application · Buenas noticias sobre tu solicitud",
  rejected: "About your application · Sobre tu solicitud",
  hired: "Welcome to Safehubby · Bienvenido a Safehubby",
};

function english(kind: ApplicantEmailKind, name: string, role: string): string {
  switch (kind) {
    case "received":
      return `Hi ${name},\n\nThanks for applying to be a ${role} with Safehubby. We have your application and will be in touch once we have reviewed it.`;
    case "under-review":
      return `Hi ${name},\n\nWe are reviewing your application for ${role} now. We will let you know what we decide.`;
    case "approved":
      return `Hi ${name},\n\nYour application for ${role} has been approved. We will contact you shortly about next steps.`;
    case "rejected":
      return `Hi ${name},\n\nThank you for applying for ${role}. We are not moving forward with your application at this time. We appreciate your interest in Safehubby.`;
    case "hired":
      return `Hi ${name},\n\nWelcome to the Safehubby team as a ${role}. Your manager will give you your sign-in details for the Employee portal in person. You will be asked to choose your own password the first time you sign in.`;
  }
}

function spanish(kind: ApplicantEmailKind, name: string, role: string): string {
  switch (kind) {
    case "received":
      return `Hola ${name}:\n\nGracias por solicitar el puesto de ${role} en Safehubby. Recibimos tu solicitud y te contactaremos cuando la hayamos revisado.`;
    case "under-review":
      return `Hola ${name}:\n\nEstamos revisando tu solicitud para ${role}. Te avisaremos lo que decidamos.`;
    case "approved":
      return `Hola ${name}:\n\nTu solicitud para ${role} fue aprobada. Te contactaremos pronto con los próximos pasos.`;
    case "rejected":
      return `Hola ${name}:\n\nGracias por solicitar el puesto de ${role}. Por ahora no seguiremos adelante con tu solicitud. Agradecemos tu interés en Safehubby.`;
    case "hired":
      return `Hola ${name}:\n\nBienvenido al equipo de Safehubby como ${role}. Tu supervisor te dará en persona los datos para entrar al Portal de empleados. La primera vez que entres te pediremos que elijas tu propia contraseña.`;
  }
}

export function applicantEmail(input: ApplicantEmailInput): { subject: string; body: string } {
  const name = firstName(input.name);
  return {
    subject: SUBJECTS[input.kind],
    body: `${english(input.kind, name, input.roleLabel)}\n\n— Safehubby\n\n---\n\n${spanish(input.kind, name, input.roleLabel)}\n\n— Safehubby`,
  };
}
