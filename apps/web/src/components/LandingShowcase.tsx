import type { CSSProperties } from "react";
import { useLanguage, type TranslationKey } from "../i18n.tsx";

const MARQUEE: TranslationKey[] = ["show.marq1", "show.marq2", "show.marq3", "show.marq4", "show.marq5", "show.marq6", "show.marq7"];

const CARDS: { photo: string; title: TranslationKey; text: TranslationKey; tag: TranslationKey }[] = [
  { photo: "jet", title: "show.jet", text: "show.jetText", tag: "show.jetTag" },
  { photo: "lounge", title: "show.lounge", text: "show.loungeText", tag: "show.loungeTag" },
  { photo: "yacht", title: "show.yacht", text: "show.yachtText", tag: "show.yachtTag" },
  { photo: "hotel", title: "show.hotel", text: "show.hotelText", tag: "show.hotelTag" },
  { photo: "ride", title: "show.ride", text: "show.rideText", tag: "show.rideTag" },
  { photo: "venue", title: "show.venue", text: "show.venueText", tag: "show.venueTag" },
];

/**
 * Between the hero and the swipeable presentation: a ticker of what Safehubby
 * arranges, photographs of it, and the four promises that make it safe to try.
 * Pure presentation. It links nowhere and replaces nothing: the carousel below
 * still holds every price, comparison, sign-up and job link.
 */
export function LandingShowcase() {
  const { t } = useLanguage();
  const words = [...MARQUEE, ...MARQUEE];
  return (
    <div className="show">
      {/* Decorative repetition of text that appears again below, so it is hidden from screen readers. */}
      <div className="show-marq" aria-hidden="true">
        <div className="show-marq-track">
          {words.map((k, i) => <span key={i}>{t(k)}</span>)}
        </div>
      </div>

      <section className="show-section" aria-labelledby="show-title">
        <p className="show-kicker">{t("show.kicker")}</p>
        <h2 id="show-title" className="show-title">{t("show.title")}</h2>
        <div className="show-grid">
          {CARDS.map((c, i) => (
            <article key={c.photo} className="show-card show-spot" style={{ "--i": i } as CSSProperties}>
              <img src={`/img/showcase-${c.photo}.jpg`} alt="" loading="lazy" width={1100} height={825} />
              <span className="show-tag">{t(c.tag)}</span>
              <div className="show-card-text">
                <h3>{t(c.title)}</h3>
                <p>{t(c.text)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="show-section" aria-labelledby="show-trust">
        <p className="show-kicker">{t("show.trustKicker")}</p>
        <h2 id="show-trust" className="show-title">{t("show.trustTitle")}</h2>
        <div className="show-bento">
          <div className="show-tile show-tile-big show-spot">
            <div className="show-sos" aria-hidden="true">SOS</div>
            <h3>{t("show.sos")}</h3>
            <p>{t("show.sosText")}</p>
          </div>
          <div className="show-tile show-spot">
            <div className="show-fig" aria-hidden="true">$0</div>
            <h3>{t("show.limit")}</h3>
            <p>{t("show.limitText")}</p>
          </div>
          <div className="show-tile show-spot">
            <div className="show-langs" aria-hidden="true"><span className="on">EN</span><span>ES</span></div>
            <h3>{t("show.langTitle")}</h3>
            <p>{t("show.langText")}</p>
          </div>
          <div className="show-tile show-spot">
            <div className="show-fig" aria-hidden="true">ID ✓</div>
            <h3>{t("show.person")}</h3>
            <p>{t("show.personText")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
