export const CREATE_GAME_PATTERN = "game.create";
export const GAME_COMPLETED_PATTERN = "game.completed";

export type GameConfigId = "default";

export type CreateGameRequest = {
  accountIds: string[];
  gameConfig: GameConfigId;
};

export type CreateGameResult = {
  gameId: string;
  webSocketUrl: string;
};

export type GameCompletedEvent = {
  gameId: string;
};
