import { ActionType, GameEventType, Audience } from 'shared'
import { IAction, IGameEvent } from '../engine/interfaces/engine-interfaces'
import { GameState } from '../engine/states/game-state'
import { GameEvent } from '../engine/game-event'
import { randomUUID } from 'crypto'

export class DrawCardAction implements IAction {
  private id: string = randomUUID()

  constructor(private playerId: string) {}

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.DrawCard
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return 1
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayers().find((p) => p.getId() === this.playerId)
    if (!player) return false
    if (player.getHandSize() >= 10) return false
    if (gs.getMainDeck().getSize() === 0) return false
    return true
  }

  execute(gs: GameState): IGameEvent[] {
    const player = gs.getPlayers().find((p) => p.getId() === this.playerId)!
    const cardId = gs.getMainDeck().draw()
    if (!cardId) return []
    player.addToHand(cardId)
    return [
      new GameEvent(
        GameEventType.CardDrawn,
        this.playerId,
        { cardId },
        Audience.PlayerOnly,
      ),
    ]
  }
}
