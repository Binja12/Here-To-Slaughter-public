import { ActionType, Audience, GameEventType, IGameEvent } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../events/game-event'

const MAX_HAND_SIZE = 10
const COST = 1

export class DrawCardAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
  ) {}

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
    return COST
  }

  isChallengeable(): boolean {
    return false
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (player.getActionPoints() < COST) return false
    if (player.getHandSize() >= MAX_HAND_SIZE) return false
    if (gs.getMainDeck().getSize() === 0) return false
    return true
  }

  execute(gs: GameState): IGameEvent[] {
    const player = gs.getPlayer(this.playerId)!
    const cardId = gs.getMainDeck().draw()
    if (!cardId) return []
    player.decreaseActionPoints(COST)
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
