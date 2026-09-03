import { z } from "zod";

export const CREATE_GAME_PATTERN = "game.create";
export const GAME_COMPLETED_PATTERN = "game.completed";

// Schema and type are one declaration, so the wire check and the compile-time
// shape cannot drift. The game server's config table is keyed by
// `GameConfigId`, so adding an id here without a config there fails to compile.

export const GameConfigIdSchema = z.enum(["default"]);
export type GameConfigId = z.infer<typeof GameConfigIdSchema>;

export const CreateGameRequestSchema = z.object({
  accountIds: z.array(z.string().trim().min(1)),
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
