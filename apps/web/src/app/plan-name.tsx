import { useLanguage } from "../i18n.tsx";

/**
 * Plan names in the reader's language. Premium, Premium Plus and the Elite
 * names are the same in Spanish; Family and Free are not. Anything not listed
 * keeps the name the server sent.
 */
const ES: Record<string, string> = { family: "Familia", free: "Gratis" };

export function planNameFor(id: string, name: string, language: string): string {
  return language === "es" ? ES[id] ?? name : name;
}

/** For places that need the name as a string. */
export function usePlanName(): (id: string, name: string) => string {
  const { language } = useLanguage();
  return (id, name) => planNameFor(id, name, language);
}

/** For places that only render it. */
export function PlanName({ id, name }: { id: string; name: string }) {
  return <>{usePlanName()(id, name)}</>;
}
