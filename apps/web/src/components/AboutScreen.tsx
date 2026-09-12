/**
 * Mission and leadership. Public-facing, plain, and deliberately not tied to
 * any one person's tragedy: this app addresses drunk driving, night-out
 * safety, and being reachable in a crisis, and states its mission in those
 * terms rather than borrowing a specific real family's story that belongs to
 * a different kind of loss.
 */
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
        <p className="small muted">
          — [Add your name here], Founder &amp; CEO
        </p>
        <p className="tiny muted">
          A personal note from the founder about why this exists belongs here — replace this placeholder
          with your own words.
        </p>
      </section>
    </div>
  );
}
