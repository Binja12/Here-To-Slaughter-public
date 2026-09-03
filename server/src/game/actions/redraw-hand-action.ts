import { ActionType, RefusalReason, RequestResult } from 'shared'
import { accepted, IAction, refused } from '../interfaces'
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

  canExecute(gs: GameState): RequestResult {
    if (gs.getActionPoints(this.playerId) < COST) {
      return refused(RefusalReason.NoActionPoints)
    }
    return accepted()
  }

  execute(gs: GameState): void {
    gs.decreaseActionPoints(this.playerId, COST)
    this.redrawHand(gs, this.playerId, this.emitter)
  }
}
