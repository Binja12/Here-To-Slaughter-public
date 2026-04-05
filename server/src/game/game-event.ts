import { Audience, GameEventType, IGameEvent } from "shared";

export class GameEvent implements IGameEvent {
  constructor(
    private type: GameEventType,
    private playerId: string,
    private payload: unknown,
    private audience: Audience = Audience.All,
  ) {}

  getType(): GameEventType {
    return this.type;
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getPayload(): unknown {
    return this.payload;
  }

  getAudience(): Audience {
    return this.audience;
  }
}
