// ---------------------------------------------------------------------------
// The table's story as one seat may read it. Built server-side from engine
// events (`server/src/game/views/game-log.ts`) so a line can name a card
// only to the seats that saw it; a client prints, never interprets.
// ---------------------------------------------------------------------------

export type GameLogEntry = {
  /** Monotonic per game, dense for the table. A viewer's list is the table's, some lines reworded. */
  seq: number;
  /** Epoch ms. */
  at: number;
  /** The seat the line is about; empty for the table itself (start, end). */
  playerId: string;
  text: string;
};
