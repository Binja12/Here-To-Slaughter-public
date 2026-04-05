import { ActionType, Audience, GameEventType, IGameEvent } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../game-event'

const MAX_HAND_SIZE = 10
const COST = 1

export class DrawCardAction implements IAction {
  constructor(private playerId: string) {}

  getId(): string {
    return `draw-card-${this.playerId}-${Date.now()}`
  }

  getType(): ActionType {
    return ActionType.DrawCard
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (player.getHandSize() >= MAX_HAND_SIZE) return false
    if (gs.getMainDeck().getSize() === 0) return false
    return true
  }

  execute(gs: GameState): IGameEvent[] {
    const cardId = gs.getMainDeck().draw()
    if (!cardId) return []
    gs.getPlayer(this.playerId)!.addToHand(cardId)
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
