import { IGameEvent } from './engine-interfaces'
import { GameEventType } from 'shared'

export class GameEvent implements IGameEvent {
  constructor(
    private type: GameEventType,
    private playerId: string,
    private payload?: unknown,
  ) {}

  getType(): GameEventType {
    return this.type
  }
  getPlayerId(): string {
    return this.playerId
  }
  getPayload(): unknown {
    return this.payload
  }
}
