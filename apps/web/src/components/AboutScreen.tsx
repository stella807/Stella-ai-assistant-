/** Mission and leadership. Public-facing, plain, and grounded in the
 *  founder's own reason for building this rather than anyone else's story. */
export function AboutScreen() {
  return (
    <div className="stack">
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
    </div>
  );
}
