import { useEffect, useState } from "react";
import { api, type CrewView } from "../api.ts";

const STATE_LABEL: Record<CrewView["members"][number]["state"], string> = {
  steady: "Steady",
  ahead: "Ahead of the table",
  quiet: "Gone quiet",
  "heading-home": "Heading home",
  "home-safe": "Home safe",
};

const STATE_TONE: Record<CrewView["members"][number]["state"], string> = {
  steady: "pill",
  ahead: "pill pill-warn",
  quiet: "pill pill-warn",
  "heading-home": "pill",
  "home-safe": "pill pill-safe",
};

/**
 * The table. Counts and check-in state only — never location, which stays
 * behind an individual share grant to a named person. A group where everyone
 * can watch everyone's position all night is a different, worse product.
 */
export function CrewPanel({ travelerId, refreshKey = 0 }: { travelerId: string; refreshKey?: number }) {
  const [view, setView] = useState<CrewView | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    api.crews()
      .then(async (crews) => { if (crews[0]) setView(await api.crew(crews[0].id)); })
      .catch(() => {});
  }, []);

  // The table changes while you're looking at it; keep it live.
  useEffect(() => {
    if (!view) return;
    const id = setInterval(() => { api.crew(view.crew.id).then(setView).catch(() => {}); }, 12_000);
    return () => clearInterval(id);
  }, [view?.crew.id]);

  // Refetch the moment your own night changes, so your row is never showing a
  // count you can see is wrong two inches further up the screen.
  useEffect(() => {
    if (!view || refreshKey === 0) return;
    api.crew(view.crew.id).then(setView).catch(() => {});
  }, [refreshKey, view?.crew.id]);

  if (!view) {
    return (
      <section className="card" aria-label="Crew">
        <h3>Out with people?</h3>
        <p className="small muted">
          Start a crew so the table can see who&apos;s getting ahead and who&apos;s gone quiet.
          Counts only — never anyone&apos;s location.
        </p>
        <div className="field">
          <label htmlFor="crew-name">Crew name</label>
          <input id="crew-name" value={name} placeholder="Friday" onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !name.trim()}
          onClick={() => run(async () => setView(await api.crew((await api.createCrew(name.trim())).id)))}>
          Start a crew
        </button>

        <div className="rule"><span>or join one</span></div>

        <div className="field">
          <label htmlFor="crew-code">Join code</label>
          <input id="crew-code" value={joinCode} placeholder="ABC-234" autoCapitalize="characters"
            onChange={(e) => setJoinCode(e.target.value)} />
        </div>
        <button className="btn btn-block" disabled={busy || !joinCode.trim()}
          onClick={() => run(async () => {
            const crew = await api.joinCrew(joinCode.trim().toUpperCase());
            setView(await api.crew(crew.id));
          })}>
          Join
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </section>
    );
  }

  const me = view.members.find((m) => m.travelerId === travelerId);

  return (
    <section className="card" aria-label="Crew">
      <div className="row-between">
        <h2>{view.crew.name}</h2>
        <span className="pill">{view.members.length} out</span>
      </div>

      {view.everyoneHome && <div className="banner banner-safe">Everyone&apos;s home. Good night.</div>}

      <ul className="crew">
        {view.members.map((m) => (
          <li key={m.travelerId}>
            <span className="avatar" aria-hidden="true">{initials(m.displayName)}</span>
            <span className="grow">
              <strong className="small">
                {m.displayName}{m.travelerId === travelerId ? " (you)" : ""}
              </strong>
              <span className={STATE_TONE[m.state]}>{STATE_LABEL[m.state]}</span>
            </span>
            <span className="crew-count">
              {m.drinks === null ? <span className="tiny muted">hidden</span> : m.drinks}
            </span>
          </li>
        ))}
      </ul>

      <div className="row-between">
        <span className="tiny muted">Join code <strong style={{ userSelect: "all" }}>{view.crew.joinCode}</strong></span>
        <button className="btn btn-sm btn-ghost" disabled={busy}
          onClick={() => run(async () => setView(await api.crew(
            (await api.shareCount(view.crew.id, !(me && me.drinks !== null))).id))) }>
          {me && me.drinks !== null ? "Hide my count" : "Show my count"}
        </button>
      </div>

      <button className="btn btn-block btn-ghost" disabled={busy}
        onClick={() => run(async () => { await api.leaveCrew(view.crew.id); setView(null); })}>
        Leave crew
      </button>

      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
