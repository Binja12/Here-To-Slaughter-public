import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { RedrawHand } from '../tasks/redraw-hand-task'
import { GameEventEmitter } from '../events/game-event-emitter'

const COST = 3

// ---------------------------------------------------------------------------
// The player-request half of redrawing a hand. The mechanic is RedrawHand, in
// `tasks/redraw-hand-task.ts`, shared with RedrawHandTask (§1); this adds the
// cost, the guards and a queue identity.
// ---------------------------------------------------------------------------

export class RedrawHandAction extends RedrawHand implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly emitter: GameEventEmitter,
  ) {
    super()
  }

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

  isReactable(): boolean {
    return false
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (player.getActionPoints() < COST) return false
    return true
  }

  execute(gs: GameState): void {
    gs.getPlayer(this.playerId)!.decreaseActionPoints(COST)
    this.redrawHand(gs, this.playerId, this.emitter)
  }
}
