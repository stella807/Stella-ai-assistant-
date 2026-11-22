/** The words on the checklist shop (/checklists), in English and Spanish. */
export type Lang = "en" | "es";

export const CHECKLIST_SHOP_WORDS = {
  en: {
    kicker: "Safehubby checklists", title: "Checklists to keep or forward",
    intro: "Practical checklists for the moments that are hard to plan: a hospital day, an airport with an older relative, hiring help. Plain text with empty boxes. Pay once by card; nothing renews.",
    buy: "Buy", opening: "Opening the card page…", loading: "Loading…", notReady: "Card payments are not switched on yet. Write to contact@safehubby.com.",
    paidTitle: "Your checklist", copy: "Copy the text", copied: "Copied", print: "Print", back: "All checklists",
    note: "General information, not medical or legal advice. Questions: contact@safehubby.com.", failed: "Something went wrong. Try again, or write to contact@safehubby.com.",
  },
  es: {
    kicker: "Listas de Safehubby", title: "Listas para guardar o reenviar",
    intro: "Listas prácticas para los momentos difíciles de planificar: un día en el hospital, el aeropuerto con un familiar mayor, contratar ayuda. Texto con casillas vacías. Pagas una vez con tarjeta; nada se renueva.",
    buy: "Comprar", opening: "Abriendo la página de pago…", loading: "Cargando…", notReady: "Los pagos con tarjeta aún no están activos. Escribe a contact@safehubby.com.",
    paidTitle: "Tu lista", copy: "Copiar el texto", copied: "Copiado", print: "Imprimir", back: "Todas las listas",
    note: "Información general, no es consejo médico ni legal. Preguntas: contact@safehubby.com.", failed: "Algo salió mal. Inténtalo otra vez o escribe a contact@safehubby.com.",
  },
} as const;
