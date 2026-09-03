import { z } from "zod";

export const CREATE_GAME_PATTERN = "game.create";
export const GAME_COMPLETED_PATTERN = "game.completed";

// Schema and type are one declaration, so the wire check and the compile-time
// shape cannot drift. The game server's config table is keyed by
// `GameConfigId`, so adding an id here without a config there fails to compile.

export const GameConfigIdSchema = z.enum(["default"]);
export type GameConfigId = z.infer<typeof GameConfigIdSchema>;

/**
 * One seat as the lobby knows it. The account id is the player id the engine
 * deals to; the username is what the other seats see — the engine names a
 * seat after it, and `SeatView.name` is what a screen shows.
 */
export const SeatedAccountSchema = z.object({
  accountId: z.string().trim().min(1),
  username: z.string().trim().min(1),
});
export type SeatedAccount = z.infer<typeof SeatedAccountSchema>;

export const CreateGameRequestSchema = z.object({
  /** In ready-list order. The engine shuffles the seats itself. */
  players: z.array(SeatedAccountSchema),
  gameConfig: GameConfigIdSchema,
});
export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>;

export type CreateGameResult = {
  gameId: string;
  webSocketUrl: string;
};

export type GameCompletedEvent = {
  gameId: string;
};
