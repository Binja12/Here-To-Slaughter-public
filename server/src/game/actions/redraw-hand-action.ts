import { ActionType, Audience, GameEventType, IGameEvent } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../events/game-event'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'

const MAX_HAND_SIZE = 10
const COST = 3

export class redrawHandAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly emmiter: GameEventEmitter,
  ) {}

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.ReDraw
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
    if (player.getActionPoints() < COST) return false
    if (gs.getMainDeck().getSize() < 5) return false
    return true
  }

  execute(gs: GameState): void {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(COST)
    for (let i = 1; i <= 5; i++) {
      const cardId = gs.getMainDeck().draw()!
      player.addToHand(cardId)
      this.emmiter.emit(GameEventFactory.cardDrawn(this.playerId))
    }
  }
}
