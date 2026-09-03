import type { PlayerView } from "../views";

// ---------------------------------------------------------------------------
// What a game server pushes to a browser, and the names both ends agree on.
// The view itself is `PlayerView` (../views.ts); this is the envelope it
// travels in and the events it rides.
// ---------------------------------------------------------------------------

/** Client -> server. Answered with a Socket.IO ack carrying `CommandResult`. */
export const GAME_COMMAND = "game:command";

/**
 * Server -> client. `GAME_STARTED` once the table is live, and again to a
 * seat that (re)connects to a live table — the view is whole state, so a
 * reconnect is a resend, not a replay. `GAME_SNAPSHOT` after anything
 * changes; a client keeps the highest `version` and drops older arrivals,
 * because pushes can interleave with acks. `GAME_COMPLETED` carries the
 * final state, `phase === Concluded`.
 */
export const GAME_STARTED = "game-started";
export const GAME_SNAPSHOT = "game:snapshot";
export const GAME_COMPLETED = "game-completed";

export type GameSnapshot<TState = PlayerView> = {
  gameId: string;
  /** Monotonic per game. Every seat's snapshot of one flush shares it. */
  version: number;
  state: TState;
};
