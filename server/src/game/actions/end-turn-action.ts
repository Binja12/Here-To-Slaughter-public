import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../pipelines/game-state'

const COST = 0

/**
 * A pass. Forfeits whatever budget is left, and that is the whole of it:
 * TurnManager.drain ends a turn whose budget is zero once the board is idle,
 * so an ability still resolving finishes first and no second rule decides when
 * a turn is over.
 */
export class EndTurnAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
  ) {}

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.EndTurn
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }

  isReactable(): boolean {
    return false
  }

  canExecute(gs: GameState): boolean {
    return gs.getPlayer(this.playerId) !== undefined
  }

  execute(gs: GameState): void {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(player.getActionPoints())
  }
}
