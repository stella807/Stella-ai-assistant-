import { useEffect, useRef, useState } from "react";
import LithicEmbed, { Environment, type CardEmbed } from "lithic-embed";

/**
 * Lithic's embedded card: number, expiry and CVV drawn in Lithic's own frames,
 * from a ten-minute session this app's server asked for. The digits go from
 * Lithic to this page, never through Safehubby. Masked until the assistant
 * taps Show. Its own module so only someone opening a Lithic card loads it.
 */
export default function LithicCardFields({ session, environment, onError }: {
  session: string; environment: "sandbox" | "production"; onError: (message: string) => void;
}) {
  const pan = useRef<HTMLDivElement>(null);
  const expMonth = useRef<HTMLDivElement>(null);
  const expYear = useRef<HTMLDivElement>(null);
  const cvv = useRef<HTMLDivElement>(null);
  const embed = useRef<CardEmbed | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const card = new LithicEmbed(environment === "production" ? Environment.PRODUCTION : Environment.SANDBOX).card(session);
    embed.current = card;
    const style = { color: "#FBF6EA", "font-size": "20px", "letter-spacing": "1px" };
    card.mount({
      pan: { element: pan.current!, styles: style },
      expMonth: { element: expMonth.current!, styles: style },
      expYear: { element: expYear.current!, styles: style },
      cvv: { element: cvv.current!, styles: style },
    }).catch(() => onError("Lithic could not show this card."));
    return () => { void card.unmount().catch(() => {}); embed.current = null; };
  }, [session, environment, onError]);

  const toggle = async () => {
    try { setShown(await embed.current!.toggleMasking()); }
    catch { onError("Lithic could not show this card. Close it and open it again."); }
  };

  return (
    <>
      <span className="tiny muted">Card number</span>
      <div ref={pan} className="issuing-field" />
      <div className="row" style={{ gap: 16 }}>
        <div className="stack grow" style={{ gap: 2 }}>
          <span className="tiny muted">Expires</span>
          <div className="row" style={{ gap: 4 }}><div ref={expMonth} className="issuing-field" /><span>/</span><div ref={expYear} className="issuing-field" /></div>
        </div>
        <div className="stack grow" style={{ gap: 2 }}><span className="tiny muted">CVV</span><div ref={cvv} className="issuing-field" /></div>
      </div>
      <button className="btn btn-sm" onClick={toggle}>{shown ? "Hide number" : "Show number"}</button>
    </>
  );
}
