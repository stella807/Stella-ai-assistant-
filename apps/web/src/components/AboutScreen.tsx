import { useState } from "react";

/** Mission and leadership. Public-facing, plain, and grounded in the
 *  founder's own reason for building this rather than anyone else's story.
 *  Exported as separate sections so the pre-signup landing page
 *  (`LandingIntro.tsx`) and the signed-in "About" tab can share the exact
 *  same content instead of drifting apart over time. */

export function MissionSection() {
  return (
    <section className="card stack">
      <h2>Our mission</h2>
      <p className="small">
        Safehubby exists to help people get home safe, and to make sure no one has to face a risky moment
        alone. A text answered, a ride called, or someone showing up in person can be the difference
        between a bad night and a tragedy — and too many families have lost someone to a moment that
        could have gone differently.
      </p>
      <p className="small">
        We build for the person who couldn't get a ride, the friend who needed someone to check on them
        and had no one to call, and the family who wishes there had been another option. Every feature
        here — check-ins, a sober way home, emergency escalation, a vetted assistant who can show up in
        person — exists because someone, somewhere, needed exactly that and didn't have it.
      </p>
      <p className="tiny muted">
        Safehubby is not an emergency service and never tells anyone they are safe to drive. In an
        emergency, call your local emergency number first.
      </p>
    </section>
  );
}

export function LeadershipSection() {
  return (
    <section className="card stack">
      <h2>Leadership</h2>
      <p className="small"><strong>Luis Garcia</strong> — Founder &amp; CEO</p>
      <p className="small">
        I come from the healthcare sector, where I've seen firsthand how not having someone there in a
        critical moment causes accidents, tragedies, and worse. That's the problem Safehubby exists to
        solve — making sure help, a safe way home, or someone who shows up in person is never out of
        reach when it matters most.
      </p>
    </section>
  );
}

const FEATURES: { id: string; title: string; blurb: string }[] = [
  {
    id: "night-out",
    title: "A safer night out",
    blurb: "Log drinks, get a real-time BAC estimate, and automatic check-ins that catch a bad moment before it becomes a worse one.",
  },
  {
    id: "watch",
    title: "Someone watching out for you",
    blurb: "Friends and family can follow your night and step in — a missed check-in alerts them right away, not the next morning.",
  },
  {
    id: "ride-home",
    title: "A sober way home",
    blurb: "One tap orders a ride, delivery, or a secure-transport driver, so no one has to choose between a bad decision and no way home.",
  },
  {
    id: "concierge",
    title: "A vetted assistant, in person",
    blurb: "Send a partner-network professional to grab something, check on a friend, or just be there — with a hard spend cap you set, never exceeded.",
  },
  {
    id: "emergency",
    title: "Medical escalation",
    blurb: "Real red-flag detection for alcohol poisoning and head injury, with the correct emergency number and a script ready to read.",
  },
  {
    id: "games",
    title: "Pacing, gamified",
    blurb: "Group games that reward checking in, drinking water, and getting home safe — never how much anyone drank.",
  },
];

/** Genuinely interactive, not just decorative: each card expands in place to
 *  answer "what does that actually mean" without leaving the page. */
export function WhatWeDoSection() {
  const [openId, setOpenId] = useState<string | null>(FEATURES[0]?.id ?? null);

  return (
    <section className="card stack">
      <h2>What Safehubby does</h2>
      <div className="stack" style={{ gap: 8 }}>
        {FEATURES.map((f) => {
          const open = openId === f.id;
          return (
            <button key={f.id} className="card card-quiet" style={{ textAlign: "left" }}
              aria-expanded={open} onClick={() => setOpenId(open ? null : f.id)}>
              <div className="row-between">
                <strong className="small">{f.title}</strong>
                <span className="tiny muted" aria-hidden="true">{open ? "−" : "+"}</span>
              </div>
              {open && <p className="tiny muted" style={{ marginTop: 6 }}>{f.blurb}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AboutScreen() {
  return (
    <div className="stack">
      <MissionSection />
      <WhatWeDoSection />
      <LeadershipSection />
    </div>
  );
}
