import { useEffect, useRef, useState } from "react";
import { isElitePlan, requiresHelpDeskToDowngrade, type PlanId } from "@safehubby/core";
import { api } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { Carousel, type CarouselHandle } from "./Carousel.tsx";
import { PlanComparison } from "./PlanComparison.tsx";
import { WingmanClub } from "./WingmanClub.tsx";

import { dollars, money } from "../money.ts";

/**
 * The plan list, and nothing else.
 *
 * It reports which plan was picked and at what cadence; what that costs, how it
 * is prorated and which rail settles it belong to the billing screen that owns
 * the account, not to a list of cards.
 */
export function PlanPicker({ currentPlanId, busy, onChoose }: {
  currentPlanId: string;
  busy: boolean;
  onChoose: (planId: string, cadence: "monthly" | "annual") => void;
}) {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<any[]>([]);
  const [cadence, setCadence] = useState<"monthly" | "annual">("annual");

  const [showElite, setShowElite] = useState(false);
  const carousel = useRef<CarouselHandle>(null);
  // The carousel shows one plan at a time so comparing prices isn't a scroll
  // past three you weren't looking at — but that means nothing on screen
  // says what any *other* plan costs unless you remember it from the last
  // swipe. This tracks which slide is up so the ladder below can highlight
  // it, and the ladder itself is what actually answers "what's the price
  // difference" without swiping through all of them to find out.
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => { api.catalog().then((c) => setPlans(c.plans)).catch(() => {}); }, []);

  const everyday = plans.filter((p) => !isElitePlan(p.id as PlanId));
  const elite = plans.filter((p) => isElitePlan(p.id as PlanId));
  const onElite = elite.some((p) => p.id === currentPlanId);
  const currentPlan = plans.find((p) => p.id === currentPlanId);

  const card = (p: any) => {
    const price = cadence === "annual" ? p.annualCents : p.monthlyCents;
    const saving = p.monthlyCents > 0
      ? Math.round(((p.monthlyCents * 12 - p.annualCents) / (p.monthlyCents * 12)) * 100)
      : 0;
    const current = p.id === currentPlanId;
    // Cheaper, but still a paid plan — see requiresHelpDeskToDowngrade.
    // Cancelling down to Free is not this case, and stays a plain button.
    const isDowngrade = !current && currentPlan && requiresHelpDeskToDowngrade(currentPlanId as PlanId, p.id as PlanId);
    // Premium Plus: everything the app does, for two, and the tier the
    // pricing is actually built around. A list of four equal options
    // makes the reader do the comparing.
    const featured = p.id === "premium-plus" && !current;
    // Elite plans stay visible with everything they include even before the
    // revenue cushion behind the spending allowance clears — see billing.ts's
    // eliteUnlockThresholdCents. Locked just means the button can't be
    // pressed yet, never that the tier disappears.
    const locked = Boolean(p.locked);
    // What joining today actually costs, computed by the server (see the
    // catalog route). The launch discount has to be visible on the price
    // somebody is agreeing to, not just on a banner above it.
    const offer = cadence === "annual" ? p.annualOffer : p.monthlyOffer;
    const discounted = Boolean(offer?.discounted) && price > 0;

    return (
      <section key={p.id} className={`card plan${current ? " plan-on" : ""}${featured ? " plan-featured" : ""}`}>
        {featured && <span className="plan-tag">{t("plans.mostPicked")}</span>}
        {locked && <span className="plan-tag">{t("plans.comingSoon")}</span>}
        <div className="row-between">
          <h3>{p.name}</h3>
          {current && <span className="pill pill-safe">{t("plans.yourPlan")}</span>}
        </div>

        <div className="plan-price">
          {price === 0 ? t("pricing.free") : (
            <>
              {discounted && <s className="plan-was">{money(price)}</s>}
              {money(discounted ? offer.payCents : price)}
            </>
          )}
          {price > 0 && <span className="plan-per">{t(cadence === "annual" ? "plans.perYearSuffix" : "plans.perMonthSuffix")}</span>}
        </div>

        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {cadence === "annual" && saving > 0 && (
            <span className="pill pill-safe">{t("plans.save").replace("{pct}", String(saving))}</span>
          )}
          {/* The amount, not just the percentage: 3% is a number nobody can
              price in their head, and this is small enough that hiding it
              behind a percentage would be the flattering version. */}
          {discounted && (
            <span className="pill pill-safe">
              {t("plans.launchParty").replace("{amount}", money(offer.discountCents))}
            </span>
          )}
        </div>

        <p className="small muted">{p.blurb}</p>

        {locked ? (
          <p className="tiny muted" style={{ margin: 0 }}>
            {t("plans.notOpenYet")}
          </p>
        ) : isDowngrade ? (
          <HelpDeskDowngradeButton fromName={currentPlan?.name ?? ""} toPlanId={p.id} toName={p.name} />
        ) : (
          <button className={`btn btn-block${current ? "" : " btn-primary"}`} disabled={busy || current}
            onClick={() => onChoose(p.id, cadence)}>
            {current ? t("plans.currentPlan") : p.monthlyCents === 0 ? t("plans.switchToFree") : t("plans.choose").replace("{name}", p.name)}
          </button>
        )}
      </section>
    );
  };

  const everydayIndex = Math.max(0, everyday.findIndex((p) => p.id === currentPlanId));

  // Opens on the subscriber's own plan rather than always on Free — jumped to
  // once the plans have actually rendered, since Carousel reads real DOM
  // offsets to scroll and there is nothing to jump to before that.
  useEffect(() => {
    if (everyday.length > 0) { carousel.current?.goTo(everydayIndex); setActiveIndex(everydayIndex); }
  }, [everyday.length, everydayIndex]);

  return (
    <>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={cadence === "monthly"} onClick={() => setCadence("monthly")}>{t("plans.monthlyTab")}</button>
        <button role="tab" aria-selected={cadence === "annual"} onClick={() => setCadence("annual")}>{t("plans.annualTab")}</button>
      </div>

      {/* The actual answer to "what's the difference" — every plan's price
          in one row, so it doesn't depend on remembering the last one you
          swiped past. Tapping one jumps the carousel straight to it. */}
      {everyday.length > 1 && (
        <div className="plan-ladder" role="list" aria-label={t("plans.comparePrices")}>
          {everyday.map((p, i) => {
            const price = cadence === "annual" ? p.annualCents : p.monthlyCents;
            return (
              <button key={p.id} role="listitem"
                className={`plan-ladder-item${i === activeIndex ? " plan-ladder-active" : ""}`}
                aria-current={i === activeIndex} onClick={() => carousel.current?.goTo(i)}>
                <span className="plan-ladder-name">{p.name}</span>
                <span className="plan-ladder-price">{price === 0 ? t("pricing.free") : dollars(price)}</span>
              </button>
            );
          })}
        </div>
      )}

      <PlanComparison plans={everyday} />

      {/* One plan at a time rather than four cards stacked: comparing prices
          used to mean scrolling past three you were not looking at to reach
          the fourth. The subscriber's own plan opens the carousel so
          "what am I on" needs no swiping to answer, and the ladder above now
          covers the actual comparing. */}
      {everyday.length > 0 && (
        <Carousel
          ref={carousel}
          labels={everyday.map((p) => p.name)}
          ariaLabel={t("plans.plansAriaLabel")}
          prevLabel={t("plans.previousPlan")}
          nextLabel={t("plans.nextPlan")}
          onIndexChange={setActiveIndex}
        >
          {everyday.map((p) => <div key={p.id} className="slide">{card(p)}</div>)}
        </Carousel>
      )}

      {/* The Elite ladder is a different product, not a fifth option, and
          leaving it in the same flat list meant scrolling past three
          five-figure prices to compare Free against Premium. Folded away
          unless somebody is on it or goes looking — discoverable, but not in
          the way of the decision most people are actually making. */}
      {elite.length > 0 && (
        <section className="card stack">
          <div className="row-between">
            <div className="stack" style={{ gap: 2 }}>
              <h3>{t("plans.conciergeMemberships")}</h3>
              <p className="tiny muted" style={{ margin: 0 }}>
                {t("plans.eliteBlurb").replace("{amount}", dollars(elite[0].monthlyCents))}
              </p>
            </div>
            {!onElite && (
              <button className="btn btn-sm btn-ghost" aria-expanded={showElite}
                onClick={() => setShowElite((v) => !v)}>
                {showElite ? t("plans.hide") : t("plans.seeThem")}
              </button>
            )}
          </div>
          {(showElite || onElite) && elite.map(card)}
        </section>
      )}

      {/* A separate membership, not a plan tier — it stacks on top of
          whatever plan is chosen above rather than replacing it. */}
      <WingmanClub />

      <p className="tiny muted">{t("plans.footerNote")}</p>
    </>
  );
}

/**
 * Stands in for the plain "Choose {name}" button on a downgrade between two
 * still-paid tiers — see `requiresHelpDeskToDowngrade` in subscription.ts.
 * Files a real desk task (the same "message" kind the desk-tasks screen
 * already offers) rather than pretending there is a live chat to a PA: a
 * person on the roster picks it up and makes the change, the same way they
 * already pick up "cancel this for me" today.
 */
function HelpDeskDowngradeButton({ fromName, toPlanId, toName }: { fromName: string; toPlanId: string; toName: string }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      // Always written in English regardless of the subscriber's own
      // language — this note is read by Safehubby's own help desk staff,
      // not shown back to the customer, so it follows the ops team's
      // working language rather than the UI's.
      await api.createDeskTask({
        kind: "message",
        note: `Please move my subscription from ${fromName} to ${toName} (plan id: ${toPlanId}).`,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("plans.helpDeskError"));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return <div className="banner banner-safe">{t("plans.helpDeskSent")}</div>;
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <button className="btn btn-block btn-ghost" disabled={busy} onClick={send}>
        {busy ? t("plans.helpDeskSending") : t("plans.helpDeskContact").replace("{name}", toName)}
      </button>
      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}
