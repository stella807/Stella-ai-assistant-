import { Pool } from "pg";
import { openLocations, sealLocations, type Cipher } from "./crypto.ts";
import type { Db, StoreLike } from "./store.ts";

/**
 * Postgres-backed store for deployment.
 *
 * The database document is held in one JSONB row and rewritten on each update.
 * That is a deliberate trade for this stage: it keeps the domain and all the
 * route logic identical to the file store, so the tested behaviour is the
 * deployed behaviour, and it is durable across the container restarts that a
 * platform does constantly.
 *
 * The cost, stated plainly because it decides how the service must be
 * configured: writes are last-writer-wins across the whole document. Within a
 * single Node process this is safe — `update()` mutates synchronously and the
 * event loop cannot interleave two of them — so the service must run at
 * **exactly one replica**. Horizontal scaling requires splitting this into real
 * tables per aggregate first. `docs/deploy.md` says so, and the row carries a
 * version column so a second writer is detected rather than silently winning.
 *
 * Location pings are encrypted before they leave the process; see crypto.ts.
 */

/**
 * Whether to negotiate TLS.
 *
 * Railway exposes Postgres two ways: over its private network
 * (`*.railway.internal`), where traffic never leaves the project and the server
 * does not offer TLS at all, and through a public proxy, where TLS is required
 * but the chain is not one Node ships a root for. Getting this wrong fails the
 * connection outright in both directions, so it is decided explicitly and
 * tested rather than sniffed from a substring.
 */
export function sslConfigFor(connectionString: string): { rejectUnauthorized: boolean } | undefined {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return undefined;
  }

  const mode = url.searchParams.get("sslmode");
  if (mode === "disable") return undefined;
  if (mode === "require" || mode === "prefer") return { rejectUnauthorized: false };
  if (mode === "verify-full" || mode === "verify-ca") return { rejectUnauthorized: true };

  const host = url.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  const isPrivate = host.endsWith(".railway.internal") || host.endsWith(".internal");
  return isLocal || isPrivate ? undefined : { rejectUnauthorized: false };
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS safehubby_state (
    id          integer PRIMARY KEY DEFAULT 1,
    version     bigint  NOT NULL DEFAULT 0,
    document    jsonb   NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT single_row CHECK (id = 1)
  );
`;

export class PostgresStore implements StoreLike {
  #pool: Pool;
  #cipher: Cipher | null;
  #db: Db;
  #version = 0;
  /** Serialises writes so an await inside one flush cannot interleave another. */
  #flushing: Promise<void> = Promise.resolve();

  private constructor(pool: Pool, cipher: Cipher | null, db: Db, version: number) {
    this.#pool = pool;
    this.#cipher = cipher;
    this.#db = db;
    this.#version = version;
  }

  static async connect(connectionString: string, cipher: Cipher | null, empty: Db): Promise<PostgresStore> {
    const pool = new Pool({
      connectionString,
      ssl: sslConfigFor(connectionString),
      max: 4,
    });
    await pool.query(SCHEMA);

    const { rows } = await pool.query<{ version: string; document: Db }>(
      "SELECT version, document FROM safehubby_state WHERE id = 1",
    );

    if (rows.length === 0) {
      await pool.query("INSERT INTO safehubby_state (id, version, document) VALUES (1, 0, $1)", [
        JSON.stringify(sealLocations(empty, cipher)),
      ]);
      return new PostgresStore(pool, cipher, structuredClone(empty), 0);
    }

    const loaded = openLocations(rows[0]!.document, cipher);
    return new PostgresStore(pool, cipher, { ...structuredClone(empty), ...loaded }, Number(rows[0]!.version));
  }

  get data(): Db {
    return this.#db;
  }

  update(fn: (db: Db) => void): void {
    fn(this.#db);
    this.save();
  }

  reset(seed: Db): void {
    this.#db = seed;
    this.save();
  }

  /**
   * Fire-and-forget by design: routes stay synchronous, matching the file
   * store, and writes are chained so they land in order. A failure is logged
   * rather than thrown, because losing the response to a transient database
   * blip is worse than serving it and retrying on the next write.
   */
  save(): void {
    const snapshot = JSON.stringify(sealLocations(this.#db, this.#cipher));
    this.#flushing = this.#flushing.then(async () => {
      try {
        const next = this.#version + 1;
        const { rowCount } = await this.#pool.query(
          "UPDATE safehubby_state SET document = $1, version = $2, updated_at = now() WHERE id = 1 AND version = $3",
          [snapshot, next, this.#version],
        );
        if (rowCount === 0) {
          // Another writer moved the row: this deployment is running more than
          // one replica, which this store does not support.
          console.error(
            "[safehubby] Concurrent write detected. This store requires exactly one replica — see docs/deploy.md.",
          );
          const { rows } = await this.#pool.query<{ version: string }>("SELECT version FROM safehubby_state WHERE id = 1");
          this.#version = Number(rows[0]?.version ?? this.#version);
          return;
        }
        this.#version = next;
      } catch (err) {
        console.error("[safehubby] Failed to persist state:", err instanceof Error ? err.message : err);
      }
    });
  }

  /** Lets shutdown and tests wait for in-flight writes. */
  async flushed(): Promise<void> {
    await this.#flushing;
  }

  async close(): Promise<void> {
    await this.flushed();
    await this.#pool.end();
  }
}
