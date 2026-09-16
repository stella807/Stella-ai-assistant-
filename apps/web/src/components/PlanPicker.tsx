import { useEffect, useRef, useState } from "react";
import { isElitePlan, type PlanId } from "@safehubby/core";
import { api } from "../api.ts";
import { Carousel, type CarouselHandle } from "./Carousel.tsx";

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
  const [plans, setPlans] = useState<any[]>([]);
  const [cadence, setCadence] = useState<"monthly" | "annual">("annual");

  const [showElite, setShowElite] = useState(false);
  const carousel = useRef<CarouselHandle>(null);

  useEffect(() => { api.catalog().then((c) => setPlans(c.plans)).catch(() => {}); }, []);

  const everyday = plans.filter((p) => !isElitePlan(p.id as PlanId));
  const elite = plans.filter((p) => isElitePlan(p.id as PlanId));
  const onElite = elite.some((p) => p.id === currentPlanId);

  const card = (p: any) => {
    const price = cadence === "annual" ? p.annualCents : p.monthlyCents;
    const saving = p.monthlyCents > 0
      ? Math.round(((p.monthlyCents * 12 - p.annualCents) / (p.monthlyCents * 12)) * 100)
      : 0;
    const current = p.id === currentPlanId;
    // Premium Plus: everything the app does, for two, and the tier the
    // pricing is actually built around. A list of four equal options
    // makes the reader do the comparing.
    const featured = p.id === "premium-plus" && !current;
    // What joining today actually costs, computed by the server (see the
    // catalog route). The launch discount has to be visible on the price
    // somebody is agreeing to, not just on a banner above it.
    const offer = cadence === "annual" ? p.annualOffer : p.monthlyOffer;
    const discounted = Boolean(offer?.discounted) && price > 0;

    return (
      <section key={p.id} className={`card plan${current ? " plan-on" : ""}${featured ? " plan-featured" : ""}`}>
        {featured && <span className="plan-tag">Most people pick this</span>}
        <div className="row-between">
          <h3>{p.name}</h3>
          {current && <span className="pill pill-safe">Your plan</span>}
        </div>

        <div className="plan-price">
          {price === 0 ? "Free" : (
            <>
              {discounted && <s className="plan-was">{money(price)}</s>}
              {money(discounted ? offer.payCents : price)}
            </>
          )}
          {price > 0 && <span className="plan-per">/{cadence === "annual" ? "year" : "month"}</span>}
        </div>

        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {cadence === "annual" && saving > 0 && <span className="pill pill-safe">Save {saving}%</span>}
          {/* The amount, not just the percentage: 3% is a number nobody can
              price in their head, and this is small enough that hiding it
              behind a percentage would be the flattering version. */}
          {discounted && (
            <span className="pill pill-safe">
              Launch party — {money(offer.discountCents)} off your first year
            </span>
          )}
        </div>

        <p className="small muted">{p.blurb}</p>

        <button className={`btn btn-block${current ? "" : " btn-primary"}`} disabled={busy || current}
          onClick={() => onChoose(p.id, cadence)}>
          {current ? "Current plan" : p.monthlyCents === 0 ? "Switch to Free" : `Choose ${p.name}`}
        </button>
      </section>
    );
  };

  const everydayIndex = Math.max(0, everyday.findIndex((p) => p.id === currentPlanId));

  // Opens on the subscriber's own plan rather than always on Free — jumped to
  // once the plans have actually rendered, since Carousel reads real DOM
  // offsets to scroll and there is nothing to jump to before that.
  useEffect(() => {
    if (everyday.length > 0) carousel.current?.goTo(everydayIndex);
  }, [everyday.length, everydayIndex]);

  return (
    <>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={cadence === "monthly"} onClick={() => setCadence("monthly")}>Monthly</button>
        <button role="tab" aria-selected={cadence === "annual"} onClick={() => setCadence("annual")}>Annual</button>
      </div>

      {/* One plan at a time rather than four cards stacked: comparing prices
          used to mean scrolling past three you were not looking at to reach
          the fourth. The subscriber's own plan opens the carousel so
          "what am I on" needs no swiping to answer. */}
      {everyday.length > 0 && (
        <Carousel
          ref={carousel}
          labels={everyday.map((p) => p.name)}
          ariaLabel="Plans"
          prevLabel="Previous plan"
          nextLabel="Next plan"
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
              <h3>Concierge memberships</h3>
              <p className="tiny muted" style={{ margin: 0 }}>
                Hours of a personal assistant every month, plus the luxury desk. From {dollars(elite[0].monthlyCents)} a month.
              </p>
            </div>
            {!onElite && (
              <button className="btn btn-sm btn-ghost" aria-expanded={showElite}
                onClick={() => setShowElite((v) => !v)}>
                {showElite ? "Hide" : "See them"}
              </button>
            )}
          </div>
          {(showElite || onElite) && elite.map(card)}
        </section>
      )}

      <p className="tiny muted">
        SOS, location sharing, check-ins and drink count are free forever. Switching mid-month only bills the
        difference — the part of the period you already paid for is credited, never charged twice.
      </p>
    </>
  );
}
