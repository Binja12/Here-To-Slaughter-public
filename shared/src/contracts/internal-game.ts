import { z } from "zod";
import { GameSettingsSchema } from "./game-settings";

export const CREATE_GAME_PATTERN = "game.create";
export const GAME_COMPLETED_PATTERN = "game.completed";

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

// Schema and type are one declaration, so the wire check and the compile-time
// shape cannot drift. The settings travel whole: the lobby's dropdowns and
// the game server's config are the same object (`game-settings.ts`).
export const CreateGameRequestSchema = z.object({
  /** In ready-list order. The engine shuffles the seats itself. */
  players: z.array(SeatedAccountSchema),
  settings: GameSettingsSchema,
});
export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>;

export type CreateGameResult = {
  gameId: string;
  webSocketUrl: string;
};

export type GameCompletedEvent = {
  gameId: string;
};
