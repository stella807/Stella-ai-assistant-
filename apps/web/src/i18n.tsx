import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * English/Spanish for the screens a visitor sees before and around signing
 * up — the landing page (mission, what-we-do, leadership), the sign-in
 * gate, and the main navigation. This deliberately does not cover every
 * string in the app: the deeper, signed-in screens (billing detail,
 * concierge dispatch, the employee portal) stay English-only for now. Widen
 * `EN`/`ES` and wrap more components in `t()` calls as those get prioritized
 * — the dictionary shape does not need to change to grow.
 */

export type Language = "en" | "es";

const STORAGE_KEY = "safehubby-language";

const EN = {
  "app.tagline": "Get home safe",
  "app.account": "Account",
  "app.signOut": "Sign out",
  "app.drive": "Drive for Safehubby →",
  "app.careers": "Careers →",
  "app.offline": "Can't reach the Safehubby API. Start it with pnpm dev.",
  "app.footer": "Safehubby never tells anyone they are safe to drive. In an emergency call 911.",
  "nav.tonight": "Tonight",
  "nav.watch": "Watch",
  "nav.games": "Games",
  "nav.party": "Party",
  "nav.payments": "Payments",
  "nav.hiring": "Hiring",
  "nav.about": "About",

  "landing.heading": "Get home safe. Never alone.",
  "landing.subtitle": "Safehubby watches out for you on a night out, and sends real help when a text or a ride isn't enough.",
  "landing.tab.mission": "Our mission",
  "landing.tab.what": "What we do",
  "landing.tab.leadership": "Leadership",
  "landing.getStarted": "Get started →",
  "slide.about": "Who we are",
  "slide.leadership": "Leadership",
  "slide.signup": "Get started",
  "slide.work": "Work with us",
  "slide.prev": "Previous",
  "slide.next": "Next",
  "how.heading": "How it works",
  "how.step1": "Start your night. Log a drink or two — the app paces its check-ins to how the night is actually going.",
  "how.step2": "Pick someone to watch. They see your check-ins and get alerted the moment one is missed, not the next morning.",
  "how.step3": "Get real help. A ride home, supplies delivered, or a vetted assistant sent to you in person at a spend cap you set.",
  "how.step4": "Get home. Sharing ends on its own when you're home safe — nothing keeps running after it should.",
  "work.heading": "Work with Safehubby",
  "work.assistant": "I'm already an assistant",
  "work.assistantNote": "Sign in to the employee portal to see your tasks, send receipts, and check your pay.",
  "work.assistantCta": "Open the employee portal →",
  "work.apply": "I want to work with Safehubby",
  "work.applyNote": "Drive for us — standard or secure transport — with the rate published before you apply.",

  "mission.heading": "Our mission",
  "mission.p1": "Safehubby exists to help people get home safe, and to make sure no one has to face a risky moment alone. A text answered, a ride called, or someone showing up in person can be the difference between a bad night and a tragedy — and too many families have lost someone to a moment that could have gone differently.",
  "mission.p2": "We build for the person who couldn't get a ride, the friend who needed someone to check on them and had no one to call, and the family who wishes there had been another option. Every feature here — check-ins, a sober way home, emergency escalation, a vetted assistant who can show up in person — exists because someone, somewhere, needed exactly that and didn't have it.",
  "mission.disclaimer": "Safehubby is not an emergency service and never tells anyone they are safe to drive. In an emergency, call your local emergency number first.",

  "leadership.heading": "Leadership",
  "leadership.name": "Luis Garcia — Founder & CEO",
  "leadership.bio": "I come from the healthcare sector, where I've seen firsthand how not having someone there in a critical moment causes accidents, tragedies, and worse. That's the problem Safehubby exists to solve — making sure help, a safe way home, or someone who shows up in person is never out of reach when it matters most.",

  "what.heading": "What Safehubby does",
  "what.nightOut.title": "A safer night out",
  "what.nightOut.blurb": "Log drinks, get a real-time BAC estimate, and automatic check-ins that catch a bad moment before it becomes a worse one.",
  "what.watch.title": "Someone watching out for you",
  "what.watch.blurb": "Friends and family can follow your night and step in — a missed check-in alerts them right away, not the next morning.",
  "what.rideHome.title": "A sober way home",
  "what.rideHome.blurb": "One tap orders a ride, delivery, or a secure-transport driver, so no one has to choose between a bad decision and no way home.",
  "what.errands.title": "A small errand, run for you",
  "what.errands.blurb": "Someone fetches one thing or runs one errand and brings it to you — from $13.13, with a hard spend cap you set that is never exceeded.",
  "what.concierge.title": "Someone who comes and stays",
  "what.concierge.blurb": "A trained personal assistant sits with a friend who should not be alone, or goes in person to check somebody is actually okay. A different job from an errand, and a different person: an errand runner is never sent to these.",
  "what.emergency.title": "Medical escalation",
  "what.emergency.blurb": "Real red-flag detection for alcohol poisoning and head injury, with the correct emergency number and a script ready to read.",
  "what.games.title": "Pacing, gamified",
  "what.games.blurb": "Group games that reward checking in, drinking water, and getting home safe — never how much anyone drank.",

  "auth.signIn": "Sign in",
  "auth.createAccount": "Create account",
  "auth.welcomeBack": "Welcome back",
  "auth.setUp": "Set up Safehubby",
  "auth.yourName": "Your name",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.passwordHint": "At least 10 characters. Length beats punctuation.",
  "auth.home": "Home (what your ride home is called)",
  "auth.homePlaceholder": "142 Rowan St",
  "auth.privacy": "Your location and drink history are yours. They are never sold, and never used for ad targeting.",
  "auth.referral": "Referral code (optional)",
  "auth.referralHint": "Got a code from a friend? Enter it and they get credit.",

  "share.heading": "Invite a friend",
  "share.body": "Safehubby works better when the people you go out with are on it too — a check-in needs someone at the other end.",
  "share.yourCode": "Your referral code",
  "share.shareCta": "Share",
  "share.copyCta": "Copy referral",
  "share.copied": "Copied",
  "share.copyFailed": "Couldn't copy. Select the code above instead.",
  "share.joinedOne": "1 person has joined with your code.",
  "share.joinedMany": "{n} people have joined with your code.",
  "share.nav": "Invite",

  "launch.heading": "We're launching",
  "launch.soon": "Launching soon",
  "launch.noteOpen": "Sign up before {date} and take {pct} off your first year.",
  "launch.noteUpcoming": "Opens {date}: {pct} off your first year for everyone who joins in the window.",
  "launch.noteClosed": "The launch-party discount has closed.",
  "launch.invitedBy": "You were invited with code {code} — it's already filled in on the sign-up form.",

  "news.heading": "Get told when we go live",
  "news.body": "We're hiring and insuring the people who do the work. Leave your email and we'll tell you the day the service actually starts — no charge until then, and nothing before.",
  "news.cta": "Tell me when it's running",
  "news.thanks": "You're on the list",
  "news.already": "You're already on the list",
  "news.failed": "Couldn't add you to the list. Try again in a moment.",
  "news.privacy": "One email when we launch. We don't sell your address, and you can leave the list at any time.",
  "work.staff": "I want to work with people, not drive",
  "work.staffNote": "Personal assistant, errand runner, or secretary — insured from day one, with the rate published before you apply.",
  "work.staffCta": "See open roles →",

  "slide.pricing": "What it costs",
  "pricing.heading": "What it costs",
  "pricing.subtitle": "Every price, before you make an account. The safety basics are free and always will be.",
  "pricing.plan": "Plan",
  "pricing.perMonth": "Per month",
  "pricing.people": "People",
  "pricing.free": "Free",
  "pricing.freeNote": "Annual billing saves about 17%. Location sharing, check-ins, drink count and SOS cost nothing on any plan, forever.",
  "pricing.sendSomeone": "Sending someone to you",
  "pricing.task": "Task",
  "pricing.typical": "Typical",
  "pricing.youPay": "You pay",
  "pricing.errandsTitle": "Small errands — an errand runner",
  "pricing.errandsBlurb": "Short and specific: one thing fetched, one errand run. Priced for a quick job, and capped at $100 of spend so \"quick\" stays quick.",
  "pricing.conciergeTitle": "Personal concierge — a personal assistant",
  "pricing.conciergeBlurb": "Someone comes to you and stays: sitting with a friend who should not be alone, or going in person to check somebody is actually okay. Only a trained personal assistant is sent to these — never an errand runner.",
  "pricing.capNote": "On top of this you set a spend cap for anything they buy for you. The cap is a ceiling, not a price — you are charged for what is actually spent, and never a cent over it.",

  "pay.heading": "What we pay for the work",
  "pay.driverRow": "Drive someone home",
  "pay.driverNote": "Driving pays {base} a trip plus {mile} a mile and {minute} a minute — a base, plus what the trip actually costs in distance and time.",
  "pay.note": "The same rate in every market we work. Safehubby's margin is added on top of these numbers, never taken out of them.",

  "invest.heading": "Invest in Safehubby",
  "invest.body": "We're building the safety net for a night out — real dispatch, real drivers and assistants, not just a button that says SOS. If you'd like to back that, we'd like to hear from you.",
  "invest.cta": "Get in touch about investing →",

  "footer.contact": "Contact",
  "footer.press": "Press",
  "footer.terms": "Terms of Service",
  "footer.privacy": "Privacy Policy",
  "footer.termsPending": "Our Terms of Service are being finalized before launch. Questions in the meantime: hello@safehubby.app.",
  "footer.privacyPending": "Our Privacy Policy is being finalized before launch. Questions in the meantime: hello@safehubby.app.",
  "footer.copyright": "© {year} Safehubby. All rights reserved.",

  "press.tag": "FOR IMMEDIATE RELEASE",
  "press.headline": "Safehubby Opens Pre-Launch Signups in Puerto Rico, Texas, and Los Angeles",
  "press.body1": "Safehubby, a personal safety app built for nights out, today opened pre-launch signups ahead of its rollout in Puerto Rico, Texas, and Los Angeles. The app checks in on users through the night on an adaptive schedule, keeps an honest log of check-ins and drinks, and makes getting home the easiest option — alerting a chosen contact automatically if a check-in is missed.",
  "press.body2": "Beyond safety tracking, Safehubby offers a personal concierge service: a vetted assistant who can check on a friend in person, run an errand, or handle a booking, dispatched to a spend cap the customer sets and that is never exceeded. Its Elite tier adds a dedicated concierge desk, jet-travel and yacht-charter booking, and a concierge physician's retainer covered by Safehubby rather than billed to the member.",
  "press.body3": "Signups are open now at no cost during the pre-launch period — no service is billed until launch. Safehubby plans to expand beyond its three launch markets as it grows.",
  "press.quote": "“We built this for the person who couldn’t get a ride, the friend who needed someone to check on them and had no one to call, and the family who wishes there had been another option,” said Safehubby’s founding team. “Every feature here exists because someone, somewhere, needed exactly that and didn’t have it.”",
  "press.contactLabel": "Press contact:",
  "press.boilerplate": "About Safehubby: Safehubby is a safety-first app for nights out, combining automated check-ins, a sober way home, emergency escalation, and a vetted personal concierge in one product. Safehubby is not an emergency service and never tells anyone they are safe to drive.",
  "press.kit": "For interviews, logos, or screenshots, write to press@safehubby.app.",

  "footer.paymentsAccepted": "Payments accepted",
  "footer.paymentsSecured": "Card details are handled by Stripe; PayPal payments by PayPal. Safehubby never sees or stores a full card number.",
} as const;

export type TranslationKey = keyof typeof EN;

const ES: Record<TranslationKey, string> = {
  "app.tagline": "Llega a casa a salvo",
  "app.account": "Cuenta",
  "app.signOut": "Cerrar sesión",
  "app.drive": "Maneja para Safehubby →",
  "app.careers": "Empleo →",
  "app.offline": "No se puede conectar con la API de Safehubby. Inícialo con pnpm dev.",
  "app.footer": "Safehubby nunca le dice a nadie que puede manejar. En una emergencia, llama al 911.",
  "nav.tonight": "Esta noche",
  "nav.watch": "Vigilar",
  "nav.games": "Juegos",
  "nav.party": "Fiesta",
  "nav.payments": "Pagos",
  "nav.hiring": "Empleo",
  "nav.about": "Acerca de",

  "landing.heading": "Llega a casa a salvo. Nunca solo.",
  "landing.subtitle": "Safehubby cuida de ti en una noche de fiesta y envía ayuda real cuando un mensaje o un viaje no es suficiente.",
  "landing.tab.mission": "Nuestra misión",
  "landing.tab.what": "Qué hacemos",
  "landing.tab.leadership": "Liderazgo",
  "landing.getStarted": "Comenzar →",
  "slide.about": "Quiénes somos",
  "slide.leadership": "Liderazgo",
  "slide.signup": "Comenzar",
  "slide.work": "Trabaja con nosotros",
  "slide.prev": "Anterior",
  "slide.next": "Siguiente",
  "how.heading": "Cómo funciona",
  "how.step1": "Comienza tu noche. Registra una bebida o dos — la app ajusta sus chequeos según cómo va realmente la noche.",
  "how.step2": "Elige a alguien que te cuide. Ve tus chequeos y recibe una alerta en el momento en que falta uno, no a la mañana siguiente.",
  "how.step3": "Consigue ayuda real. Un viaje a casa, suministros entregados, o un asistente verificado enviado en persona con un límite de gasto que tú fijas.",
  "how.step4": "Llega a casa. El compartir termina por sí solo cuando llegas a salvo — nada sigue funcionando más de lo que debe.",
  "work.heading": "Trabaja con Safehubby",
  "work.assistant": "Ya soy asistente",
  "work.assistantNote": "Inicia sesión en el portal de empleados para ver tus tareas, enviar recibos y consultar tu pago.",
  "work.assistantCta": "Abrir el portal de empleados →",
  "work.apply": "Quiero trabajar con Safehubby",
  "work.applyNote": "Maneja con nosotros — estándar o transporte seguro — con la tarifa publicada antes de que apliques.",

  "mission.heading": "Nuestra misión",
  "mission.p1": "Safehubby existe para ayudar a las personas a llegar a casa a salvo, y para asegurarse de que nadie enfrente un momento de riesgo solo. Una llamada contestada, un viaje solicitado, o alguien que llegue en persona puede ser la diferencia entre una mala noche y una tragedia — y demasiadas familias han perdido a alguien en un momento que pudo haber sido diferente.",
  "mission.p2": "Construimos esto para la persona que no pudo conseguir un viaje, el amigo que necesitaba que alguien lo revisara y no tenía a quién llamar, y la familia que desearía haber tenido otra opción. Cada función aquí — chequeos, una forma sobria de llegar a casa, escalamiento de emergencia, un asistente verificado que puede presentarse en persona — existe porque alguien, en algún lugar, necesitó exactamente eso y no lo tuvo.",
  "mission.disclaimer": "Safehubby no es un servicio de emergencia y nunca le dice a nadie que puede manejar. En una emergencia, llama primero a tu número de emergencia local.",

  "leadership.heading": "Liderazgo",
  "leadership.name": "Luis Garcia — Fundador y Director Ejecutivo",
  "leadership.bio": "Vengo del sector de la salud, donde he visto de primera mano cómo la falta de alguien presente en un momento crítico causa accidentes, tragedias y algo peor. Ese es el problema que Safehubby existe para resolver — asegurando que la ayuda, una forma segura de llegar a casa, o alguien que se presente en persona, nunca esté fuera de alcance cuando más importa.",

  "what.heading": "Qué hace Safehubby",
  "what.nightOut.title": "Una noche más segura",
  "what.nightOut.blurb": "Registra tus bebidas, obtén una estimación de alcohol en tiempo real, y chequeos automáticos que detectan un mal momento antes de que empeore.",
  "what.watch.title": "Alguien cuidándote",
  "what.watch.blurb": "Amigos y familiares pueden seguir tu noche e intervenir — un chequeo perdido los alerta de inmediato, no a la mañana siguiente.",
  "what.rideHome.title": "Una forma sobria de llegar a casa",
  "what.rideHome.blurb": "Un toque solicita un viaje, entrega, o un conductor de transporte seguro, para que nadie tenga que elegir entre una mala decisión y no tener cómo volver.",
  "what.errands.title": "Un encargo pequeño, hecho por ti",
  "what.errands.blurb": "Alguien recoge una cosa o hace un encargo y te lo trae — desde $13.13, con un límite de gasto estricto que tú fijas y nunca se excede.",
  "what.concierge.title": "Alguien que viene y se queda",
  "what.concierge.blurb": "Un asistente personal capacitado acompaña a un amigo que no debería estar solo, o va en persona a comprobar que alguien está bien. Es un trabajo distinto de un encargo, y una persona distinta: a estas nunca enviamos a un mensajero.",
  "what.emergency.title": "Escalamiento médico",
  "what.emergency.blurb": "Detección real de señales de alerta por intoxicación alcohólica y lesiones en la cabeza, con el número de emergencia correcto y un guion listo para leer.",
  "what.games.title": "Ritmo, en forma de juego",
  "what.games.blurb": "Juegos grupales que premian registrarte, tomar agua, y llegar a casa a salvo — nunca cuánto bebió alguien.",

  "auth.signIn": "Iniciar sesión",
  "auth.createAccount": "Crear cuenta",
  "auth.welcomeBack": "Bienvenido de nuevo",
  "auth.setUp": "Configura Safehubby",
  "auth.yourName": "Tu nombre",
  "auth.email": "Correo electrónico",
  "auth.password": "Contraseña",
  "auth.passwordHint": "Al menos 10 caracteres. La longitud vence a la puntuación.",
  "auth.home": "Casa (cómo se llama tu viaje a casa)",
  "auth.homePlaceholder": "Calle Rowan 142",
  "auth.privacy": "Tu ubicación e historial de bebidas son tuyos. Nunca se venden, y nunca se usan para publicidad dirigida.",
  "auth.referral": "Código de referencia (opcional)",
  "auth.referralHint": "¿Tienes un código de un amigo? Ingrésalo y recibirá el crédito.",

  "share.heading": "Invita a un amigo",
  "share.body": "Safehubby funciona mejor cuando las personas con quienes sales también lo tienen — un registro necesita a alguien del otro lado.",
  "share.yourCode": "Tu código de referencia",
  "share.shareCta": "Compartir",
  "share.copyCta": "Copiar referencia",
  "share.copied": "Copiado",
  "share.copyFailed": "No se pudo copiar. Selecciona el código de arriba.",
  "share.joinedOne": "1 persona se ha unido con tu código.",
  "share.joinedMany": "{n} personas se han unido con tu código.",
  "share.nav": "Invitar",

  "launch.heading": "Estamos lanzando",
  "launch.soon": "Lanzamiento pronto",
  "launch.noteOpen": "Regístrate antes del {date} y obtén {pct} de descuento en tu primer año.",
  "launch.noteUpcoming": "Comienza el {date}: {pct} de descuento en el primer año para todos los que se unan dentro del plazo.",
  "launch.noteClosed": "El descuento de lanzamiento ya cerró.",
  "launch.invitedBy": "Te invitaron con el código {code} — ya está completado en el formulario de registro.",

  "news.heading": "Avísame cuando abran",
  "news.body": "Estamos contratando y asegurando a las personas que hacen el trabajo. Déjanos tu correo y te avisaremos el día que el servicio realmente comience — sin cobros hasta entonces, y nada antes.",
  "news.cta": "Avísame cuando abran",
  "news.thanks": "Estás en la lista",
  "news.already": "Ya estás en la lista",
  "news.failed": "No pudimos agregarte a la lista. Inténtalo de nuevo en un momento.",
  "news.privacy": "Un solo correo cuando lancemos. No vendemos tu dirección y puedes salir de la lista cuando quieras.",
  "work.staff": "Quiero trabajar con personas, no manejar",
  "work.staffNote": "Asistente personal, mensajero de encargos o secretario/a — con seguro desde el primer día y la tarifa publicada antes de que apliques.",
  "work.staffCta": "Ver puestos disponibles →",

  "slide.pricing": "Cuánto cuesta",
  "pricing.heading": "Cuánto cuesta",
  "pricing.subtitle": "Todos los precios, antes de crear una cuenta. Lo básico de seguridad es gratis y siempre lo será.",
  "pricing.plan": "Plan",
  "pricing.perMonth": "Por mes",
  "pricing.people": "Personas",
  "pricing.free": "Gratis",
  "pricing.freeNote": "El pago anual ahorra alrededor del 17%. Compartir ubicación, registros, conteo de bebidas y SOS no cuestan nada en ningún plan, para siempre.",
  "pricing.sendSomeone": "Enviar a alguien",
  "pricing.task": "Tarea",
  "pricing.typical": "Típico",
  "pricing.youPay": "Tú pagas",
  "pricing.errandsTitle": "Encargos pequeños — un mensajero",
  "pricing.errandsBlurb": "Corto y específico: recoger una cosa, hacer un encargo. Con precio de trabajo rápido y un límite de $100 de gasto para que \"rápido\" siga siendo rápido.",
  "pricing.conciergeTitle": "Concierge personal — un asistente personal",
  "pricing.conciergeBlurb": "Alguien viene y se queda contigo: acompañar a un amigo que no debería estar solo, o ir en persona a comprobar que alguien está bien. A estas solo enviamos a un asistente personal capacitado — nunca a un mensajero.",
  "pricing.capNote": "Además, tú fijas un límite de gasto para lo que compren por ti. El límite es un techo, no un precio — se te cobra lo que realmente se gaste, y nunca un centavo más.",

  "pay.heading": "Lo que pagamos por el trabajo",
  "pay.driverRow": "Llevar a alguien a casa",
  "pay.driverNote": "Manejar paga {base} por viaje más {mile} por milla y {minute} por minuto — una base, más lo que el viaje realmente cuesta en distancia y tiempo.",
  "pay.note": "La misma tarifa en cada mercado donde trabajamos. El margen de Safehubby se suma encima de estos números, nunca se resta de ellos.",

  "invest.heading": "Invierte en Safehubby",
  "invest.body": "Estamos construyendo la red de seguridad para una noche de fiesta — despacho real, conductores y asistentes reales, no solo un botón que dice SOS. Si quieres respaldar eso, nos gustaría saber de ti.",
  "invest.cta": "Contáctanos sobre invertir →",

  "footer.contact": "Contacto",
  "footer.press": "Prensa",
  "footer.terms": "Términos de servicio",
  "footer.privacy": "Política de privacidad",
  "footer.termsPending": "Nuestros Términos de servicio se están finalizando antes del lanzamiento. Preguntas mientras tanto: hello@safehubby.app.",
  "footer.privacyPending": "Nuestra Política de privacidad se está finalizando antes del lanzamiento. Preguntas mientras tanto: hello@safehubby.app.",
  "footer.copyright": "© {year} Safehubby. Todos los derechos reservados.",

  "press.tag": "PARA PUBLICACIÓN INMEDIATA",
  "press.headline": "Safehubby abre el registro previo al lanzamiento en Puerto Rico, Texas y Los Ángeles",
  "press.body1": "Safehubby, una app de seguridad personal creada para salidas nocturnas, abrió hoy el registro previo al lanzamiento antes de su despliegue en Puerto Rico, Texas y Los Ángeles. La app hace seguimiento a los usuarios durante la noche con un horario adaptativo, mantiene un registro honesto de chequeos y tragos, y facilita llegar a casa — alertando automáticamente a un contacto elegido si se pierde un chequeo.",
  "press.body2": "Más allá del seguimiento de seguridad, Safehubby ofrece un servicio de conserjería personal: un asistente verificado que puede revisar a un amigo en persona, hacer un mandado o gestionar una reserva, despachado con un límite de gasto que el cliente fija y que nunca se excede. Su nivel Elite añade un escritorio de conserjería dedicado, reservas de vuelos privados y chárteres de yate, y el retén de un médico de conserjería cubierto por Safehubby en lugar de cobrado al miembro.",
  "press.body3": "El registro está abierto ahora sin costo durante el período previo al lanzamiento — no se cobra ningún servicio hasta el lanzamiento. Safehubby planea expandirse más allá de sus tres mercados de lanzamiento a medida que crece.",
  "press.quote": "“Construimos esto para la persona que no pudo conseguir un viaje, el amigo que necesitaba que alguien lo revisara y no tenía a quién llamar, y la familia que desearía haber tenido otra opción”, dijo el equipo fundador de Safehubby. “Cada función aquí existe porque alguien, en algún lugar, necesitó exactamente eso y no lo tuvo.”",
  "press.contactLabel": "Contacto de prensa:",
  "press.boilerplate": "Acerca de Safehubby: Safehubby es una app centrada en la seguridad para salidas nocturnas, que combina chequeos automáticos, una forma sobria de llegar a casa, escalamiento de emergencia y un conserje personal verificado en un solo producto. Safehubby no es un servicio de emergencia y nunca le dice a nadie que está en condiciones de conducir.",
  "press.kit": "Para entrevistas, logotipos o capturas de pantalla, escribe a press@safehubby.app.",

  "footer.paymentsAccepted": "Formas de pago aceptadas",
  "footer.paymentsSecured": "Los datos de la tarjeta los procesa Stripe; los pagos de PayPal, PayPal. Safehubby nunca ve ni almacena un número de tarjeta completo.",
};

const DICTS: Record<Language, Record<TranslationKey, string>> = { en: EN, es: ES };

function detectLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    // Private browsing or a blocked store — fall through to the browser's own language.
  }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es")) return "es";
  return "en";
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => detectLanguage());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Nothing to persist to — the choice just won't survive a reload.
    }
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: setLanguageState,
    t: (key) => DICTS[language][key],
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside a LanguageProvider");
  return ctx;
}
