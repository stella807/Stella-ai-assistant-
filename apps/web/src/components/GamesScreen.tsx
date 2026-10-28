import { useEffect, useState } from "react";
import { api, type Account, type GameDef } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { gamesWords } from "../app/games-copy.ts";

/**
 * The games. Every one of them scores on checking in, pacing, water, or getting
 * home — never on how much anyone drank. That constraint is the design, not a
 * disclaimer: a game that pushes volume inside a get-home-safe app would be the
 * product arguing with itself, and the person most likely to lose it is the one
 * already in trouble.
 */
export function GamesScreen({ account }: { account: Account }) {
  const w = gamesWords(useLanguage().language).games;
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
      setError(e instanceof Error ? e.message : w.failed);
    } finally {
      setBusy(false);
    }
  };

  const live = rounds.filter((r) => r.status === "open");

  return (
    <div className="stack">
      <div>
        <h2>{w.title}</h2>
        <p className="small muted">{w.lead}</p>
      </div>

      {!crew && (
        <div className="banner">{w.noCrew}</div>
      )}

      {live.length > 0 && (
        <section className="card">
          <h3>{w.live}</h3>
          <ul className="timeline">
            {live.map((r) => (
              <li key={r.id}>
                <div className="grow">
                  <strong className="small">{games.find((g) => g.id === r.gameId)?.name ?? r.gameId}</strong>
                  <div className="tiny muted">{w.playing(r.players.length)}</div>
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
            {open === g.id ? w.hide : w.how}
          </button>

          {open === g.id && (
            <>
              <p className="small">{g.howItWorks}</p>
              <div className="forfeit">
                <span className="tiny muted">{w.forfeit}</span>
                <p className="small">{g.forfeit}</p>
              </div>
              <p className="tiny muted">{w.needs(g.minPlayers)}</p>
            </>
          )}

          <button className="btn btn-primary btn-block"
            disabled={busy || players.length < g.minPlayers}
            onClick={() => start(g)}>
            {players.length < g.minPlayers
              ? w.needsCrew(g.minPlayers, players.length)
              : w.start}
          </button>
        </section>
      ))}

      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}
