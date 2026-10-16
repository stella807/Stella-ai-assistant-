import type { ReactNode } from "react";

/**
 * The top of every main screen: a photograph, the gold-ringed shield badge,
 * and a serif title — the same look as the ads, so the app a customer opens
 * after seeing one feels like the same brand rather than a plainer one.
 */
export function ScreenCover({ photo, kicker, title, children }: {
  photo: "hero" | "jet" | "suv" | "bourbon";
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className={`screen-cover screen-cover-${photo}`}>
      <img className="badge" src="/favicon.png" alt="" width={56} height={56} />
      {kicker && <span className="screen-cover-kicker">{kicker}</span>}
      <h2>{title}</h2>
      {children && <div className="screen-cover-sub">{children}</div>}
    </section>
  );
}
