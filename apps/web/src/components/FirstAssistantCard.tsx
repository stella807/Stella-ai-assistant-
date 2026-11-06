import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useLanguage } from "../i18n.tsx";

type First = NonNullable<Awaited<ReturnType<typeof api.firstAssistant>>["assistant"]>;

/**
 * The first personal assistant on the roster, shown on the landing page: a face and a first name before anyone
 * signs up. Renders nothing until somebody is hired, or if the API is unreachable.
 */
export function FirstAssistantCard() {
  const es = useLanguage().language === "es";
  const [who, setWho] = useState<First | null>(null);
  useEffect(() => {
    let live = true;
    api.firstAssistant().then((r) => { if (live) setWho(r.assistant); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!who) return null;
  return (
    <section className="card stack" aria-label={es ? "Nuestra primera asistente personal" : "Our first personal assistant"}>
      <span className="section-label">{es ? "Conoce a nuestra primera asistente personal" : "Meet our first personal assistant"}</span>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        {who.photoUrl && <img src={who.photoUrl} alt={who.firstName} width={72} height={72} style={{ borderRadius: 18, objectFit: "cover" }} />}
        <div className="stack" style={{ gap: 2 }}>
          <h3 style={{ margin: 0 }}>{who.firstName}</h3>
          {who.yearsExperience ? <span className="tiny muted">{es ? `${who.yearsExperience} años de experiencia` : `${who.yearsExperience} years of experience`}</span> : null}
        </div>
      </div>
      {who.bio && <p className="small" style={{ margin: 0 }}>{who.bio}</p>}
    </section>
  );
}
