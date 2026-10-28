/**
 * The words on the payment screens (the card on file, Stripe's and PayPal's
 * forms, the Basic plan's ID check), in English and Spanish. Spanish is typed
 * against English so a string added to one and not the other fails the build.
 */
export type Lang = "en" | "es";

const EN = {
  method: {
    title: "Payment method",
    intro: (paypal: boolean) => `${paypal ? "A card or your PayPal account" : "A credit or debit card"}, for everything: rides, secure transport, pharmacy runs, and your plan. Nothing is charged when you add it — only when something actually happens, and only up to what that thing costs.`,
    exp: "Exp",
    remove: "Remove",
    brands: "Visa, Mastercard, American Express and Discover.",
    addCard: "Add a credit or debit card",
    addPaypal: "Add your PayPal account",
    cancel: "Cancel",
    removeFailed: "Could not remove the payment method",
    cardFailed: "Could not save that card",
    accountFailed: "Could not save that account",
  },
  card: {
    loading: "Loading the card form…",
    unavailable: (paypal: boolean) => `The card form couldn't be loaded right now. Try again in a moment${paypal ? ", or save your PayPal account instead" : ""}.`,
    cancel: "Cancel",
    save: "Save card",
    saving: "Saving…",
    unreachable: "Stripe could not be reached.",
    notSaved: "Stripe could not save that card.",
    noId: "Stripe saved the card but returned no id for it.",
  },
  checkout: {
    title: "Subscribe with a card",
    ivu: "Puerto Rico billing addresses: IVU (11.5%) is added to the price and shown as its own line.",
    loading: "Loading the payment form…",
    cancel: "Cancel",
    notLoaded: "Stripe could not load the payment form.",
    notConfirmed: "Stripe could not confirm that payment.",
    unreachable: "Stripe could not be reached.",
  },
  paypal: {
    loading: "Loading PayPal…",
    unavailable: "PayPal couldn't be loaded right now.",
    unfinished: "PayPal did not finish saving that account. Nothing was saved.",
    failed: "PayPal could not save that account.",
    failedNothingSaved: "PayPal could not save that account. Nothing was saved.",
  },
  senior: {
    title: (age: number) => `Basic is for members ${age} and over`,
    intro: "Add your date of birth and a photo of your driver's licence, state ID or passport. Our team checks it; you can start using Basic right away.",
    rejected: "Your last ID was not accepted:",
    birthDate: "Date of birth",
    photo: "Photo of your ID",
    attach: "Attach a photo of your ID.",
    failed: "That did not go through. Try again.",
    sending: "Sending…",
    send: "Send my ID",
    back: "Back",
  },
  lithic: {
    number: "Card number",
    expires: "Expires",
    cvv: "CVV",
    show: "Show number",
    hide: "Hide number",
    failed: "Lithic could not show this card.",
    failedReopen: "Lithic could not show this card. Close it and open it again.",
  },
};

const ES: typeof EN = {
  method: {
    title: "Método de pago",
    intro: (paypal: boolean) => `${paypal ? "Una tarjeta o tu cuenta de PayPal" : "Una tarjeta de crédito o débito"}, para todo: viajes, transporte seguro, recogidos en farmacia y tu plan. No se cobra nada al añadirla; solo cuando algo ocurre de verdad, y solo hasta lo que eso cuesta.`,
    exp: "Vence",
    remove: "Eliminar",
    brands: "Visa, Mastercard, American Express y Discover.",
    addCard: "Añadir una tarjeta de crédito o débito",
    addPaypal: "Añadir tu cuenta de PayPal",
    cancel: "Cancelar",
    removeFailed: "No pudimos eliminar el método de pago",
    cardFailed: "No pudimos guardar esa tarjeta",
    accountFailed: "No pudimos guardar esa cuenta",
  },
  card: {
    loading: "Cargando el formulario de la tarjeta…",
    unavailable: (paypal: boolean) => `No pudimos cargar el formulario de la tarjeta ahora mismo. Inténtalo de nuevo en un momento${paypal ? " o guarda tu cuenta de PayPal" : ""}.`,
    cancel: "Cancelar",
    save: "Guardar tarjeta",
    saving: "Guardando…",
    unreachable: "No pudimos conectar con Stripe.",
    notSaved: "Stripe no pudo guardar esa tarjeta.",
    noId: "Stripe guardó la tarjeta pero no devolvió su identificador.",
  },
  checkout: {
    title: "Suscríbete con una tarjeta",
    ivu: "Direcciones de facturación en Puerto Rico: el IVU (11.5%) se suma al precio y aparece en su propia línea.",
    loading: "Cargando el formulario de pago…",
    cancel: "Cancelar",
    notLoaded: "Stripe no pudo cargar el formulario de pago.",
    notConfirmed: "Stripe no pudo confirmar ese pago.",
    unreachable: "No pudimos conectar con Stripe.",
  },
  paypal: {
    loading: "Cargando PayPal…",
    unavailable: "No pudimos cargar PayPal ahora mismo.",
    unfinished: "PayPal no terminó de guardar esa cuenta. No se guardó nada.",
    failed: "PayPal no pudo guardar esa cuenta.",
    failedNothingSaved: "PayPal no pudo guardar esa cuenta. No se guardó nada.",
  },
  senior: {
    title: (age: number) => `El plan Básico es para socios de ${age} años o más`,
    intro: "Añade tu fecha de nacimiento y una foto de tu licencia de conducir, identificación estatal o pasaporte. Nuestro equipo la revisa; puedes empezar a usar el plan Básico enseguida.",
    rejected: "Tu última identificación no fue aceptada:",
    birthDate: "Fecha de nacimiento",
    photo: "Foto de tu identificación",
    attach: "Adjunta una foto de tu identificación.",
    failed: "No se pudo enviar. Inténtalo de nuevo.",
    sending: "Enviando…",
    send: "Enviar mi identificación",
    back: "Atrás",
  },
  lithic: {
    number: "Número de tarjeta",
    expires: "Vence",
    cvv: "CVV",
    show: "Mostrar número",
    hide: "Ocultar número",
    failed: "Lithic no pudo mostrar esta tarjeta.",
    failedReopen: "Lithic no pudo mostrar esta tarjeta. Ciérrala y ábrela de nuevo.",
  },
};

export const paymentWords = (lang: Lang) => (lang === "es" ? ES : EN);

/** Stripe draws its own fields; this is the locale they are drawn in. */
export const stripeLocale = (lang: Lang) => (lang === "es" ? "es-419" : "en") as "es-419" | "en";
