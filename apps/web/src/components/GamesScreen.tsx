import { useEffect, useState } from "react";
import { api, type Account, type GameDef } from "../api.ts";

/**
 * The games. Every one of them scores on checking in, pacing, water, or getting
 * home — never on how much anyone drank. That constraint is the design, not a
 * disclaimer: a game that pushes volume inside a get-home-safe app would be the
 * product arguing with itself, and the person most likely to lose it is the one
 * already in trouble.
 */
export function GamesScreen({ account }: { account: Account }) {
  const [games, setGames] = useState<GameDef[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [crew, setCrew] = useState<{ id: string; players: { id: string; displayName: string }[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.games().then((r) => setGames(r.games)).catch(() => {});
    api.rounds().then(setRounds).catch(() => {});
    // Players come from the table you are actually out with, not from a solo
    // round that every game would reject for being one person short.
    api.crews()
      .then(async (crews) => {
        if (!crews[0]) return setCrew(null);
        const view = await api.crew(crews[0].id);
        setCrew({
          id: view.crew.id,
          players: view.members.map((m) => ({ id: m.travelerId, displayName: m.displayName })),
        });
      })
      .catch(() => setCrew(null));
  };
  useEffect(load, []);

  const players = crew?.players ?? [{ id: account.id, displayName: account.displayName }];

  const start = async (game: GameDef) => {
    setBusy(true);
    setError(null);
    try {
      await api.startRound(game.id, players);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start that round");
    } finally {
      setBusy(false);
    }
  };

  const live = rounds.filter((r) => r.status === "open");

  return (
    <div className="stack">
      <div>
        <h2>Games</h2>
        <p className="small muted">
          Five ways to make looking after each other competitive. None of them score on how much you drink.
        </p>
      </div>

      {!crew && (
        <div className="banner">
          Games are played with the table you are out with. Start or join a crew on the Tonight tab, then
          come back — rounds use whoever is in it.
        </div>
      )}

      {live.length > 0 && (
        <section className="card">
          <h3>Live rounds</h3>
          <ul className="timeline">
            {live.map((r) => (
              <li key={r.id}>
                <div className="grow">
                  <strong className="small">{games.find((g) => g.id === r.gameId)?.name ?? r.gameId}</strong>
                  <div className="tiny muted">{r.players.length} playing</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {games.map((g) => (
        <section key={g.id} className="card game">
          <div className="row-between">
            <div>
              <h3 style={{ color: "var(--text)", fontSize: 17 }}>{g.name}</h3>
              <p className="tiny muted">{g.tagline}</p>
            </div>
            <span className="pill">+{g.reward}</span>
          </div>

          <button className="btn btn-sm btn-ghost" onClick={() => setOpen(open === g.id ? null : g.id)}
            aria-expanded={open === g.id}>
            {open === g.id ? "Hide rules" : "How it works"}
          </button>

          {open === g.id && (
            <>
              <p className="small">{g.howItWorks}</p>
              <div className="forfeit">
                <span className="tiny muted">Forfeit</span>
                <p className="small">{g.forfeit}</p>
              </div>
              <p className="tiny muted">Needs {g.minPlayers}+ players.</p>
            </>
          )}

          <button className="btn btn-primary btn-block"
            disabled={busy || players.length < g.minPlayers}
            onClick={() => start(g)}>
            {players.length < g.minPlayers
              ? `Needs ${g.minPlayers} in your crew — you have ${players.length}`
              : "Start a round"}
          </button>
        </section>
      ))}

      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}
