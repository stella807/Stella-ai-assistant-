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
  "what.concierge.title": "A vetted assistant, in person",
  "what.concierge.blurb": "Send a partner-network professional to grab something, check on a friend, or just be there — with a hard spend cap you set, never exceeded.",
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
} as const;

export type TranslationKey = keyof typeof EN;

const ES: Record<TranslationKey, string> = {
  "app.tagline": "Llega a casa a salvo",
  "app.account": "Cuenta",
  "app.signOut": "Cerrar sesión",
  "app.drive": "Maneja para Safehubby →",
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
  "what.concierge.title": "Un asistente verificado, en persona",
  "what.concierge.blurb": "Envía a un profesional de la red de socios para buscar algo, revisar a un amigo, o simplemente estar ahí — con un límite de gasto estricto que tú fijas, nunca excedido.",
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
