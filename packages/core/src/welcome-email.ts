/**
 * The email a new member gets when their account is created.
 *
 * Employees already get theirs when they are hired (applicant-email.ts). A
 * member's language is not known at sign-up, and Puerto Rico reads both, so
 * the message is English followed by Spanish. It says nothing about the
 * person beyond their first name: no plan price, address or place, because an
 * inbox preview can be read over a shoulder.
 */
export interface WelcomeEmailInput {
  /** The name they typed, as their people will see it. */
  name: string;
  /** The site's public address, https only; anything else is left out. */
  siteUrl?: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

export function welcomeEmail(input: WelcomeEmailInput): { subject: string; body: string } {
  const name = firstName(input.name);
  const link = (input.siteUrl ?? "").startsWith("https://") ? input.siteUrl : undefined;
  const en = [
    `Hi ${name},`, "",
    "Welcome to Safehubby. Your account is ready.",
    "Check-ins, location sharing and SOS are free and always will be. When you want more, you can add an assistant, an errand runner or a ride from the app.",
    ...(link ? ["", `Open Safehubby: ${link}`] : []),
    "", "If you did not create this account, reply to this email and we will close it.",
  ].join("\n");
  const es = [
    `Hola ${name}:`, "",
    "Bienvenido a Safehubby. Tu cuenta está lista.",
    "Los check-ins, compartir ubicación y el SOS son gratis y siempre lo serán. Cuando quieras más, puedes añadir un asistente, un mensajero o un viaje desde la app.",
    ...(link ? ["", `Abrir Safehubby: ${link}`] : []),
    "", "Si no creaste esta cuenta, responde a este correo y la cerraremos.",
  ].join("\n");
  return {
    subject: "Welcome to Safehubby · Bienvenido a Safehubby",
    body: `${en}\n\n— Safehubby\n\n---\n\n${es}\n\n— Safehubby`,
  };
}
