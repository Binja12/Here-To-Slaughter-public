import type { Pool } from 'pg'

// ---------------------------------------------------------------------------
// The whole schema, applied at boot (`ensureSchema`). Every statement is
// idempotent, so a restart against a populated database is a no-op; a column
// change is a new ALTER here, never an edit of a CREATE. JSONB holds what the
// process already serialises for the wire (settings, config, the per-seat
// PlayerView, event payloads) so the shapes have one definition, in `shared`.
//
// `game_players.account_id` is not a foreign key to `users`: the game process
// seats whatever accounts the lobby names, and a spec seats accounts that
// never registered.
// ---------------------------------------------------------------------------

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id           TEXT PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL,
  settings     JSONB NOT NULL,
  config       JSONB NOT NULL,
  last_version INTEGER NOT NULL DEFAULT 0,
  last_state   JSONB,
  updated_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  winner_id    TEXT
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  username   TEXT NOT NULL,
  seat       INTEGER NOT NULL,
  PRIMARY KEY (game_id, account_id)
);
CREATE INDEX IF NOT EXISTS game_players_account_idx ON game_players (account_id);

CREATE TABLE IF NOT EXISTS game_log (
  game_id   TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,
  at        TIMESTAMPTZ NOT NULL,
  player_id TEXT NOT NULL,
  text      TEXT NOT NULL,
  seen      JSONB,
  PRIMARY KEY (game_id, seq)
);

CREATE TABLE IF NOT EXISTS game_events (
  game_id   TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,
  at        TIMESTAMPTZ NOT NULL,
  type      TEXT NOT NULL,
  player_id TEXT NOT NULL,
  audience  TEXT NOT NULL,
  payload   JSONB,
  PRIMARY KEY (game_id, seq)
);
`

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL)
}
