import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { MagicPlay } from '../tasks/action-tasks'
import { ReactionManager } from '../reactions/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'

const COST = 1

// ---------------------------------------------------------------------------
// The player-request half of playing a magic card. The mechanic itself is
// MagicPlay, in `tasks/action-tasks.ts`, shared with PlayMagicTask (§1); this
// adds what only a request needs — a price, the guards, a queue identity.
// ---------------------------------------------------------------------------

export class PlayMagicAction extends MagicPlay implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly reactionManager: ReactionManager,
    private readonly emmiter: GameEventEmitter,
  ) {
    super()
  }

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.PlayMagic
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }
  isReactable(): boolean { return true }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (gs.getCurrentPlayerId() !== this.playerId) return false
    if (player.getActionPoints() < COST) return false
    if (!player.getHand().includes(this.cardId)) return false
    return true
  }

  execute(gs: GameState): void {
    gs.getPlayer(this.playerId)!.decreaseActionPoints(COST)
    this.playMagic(gs, this.playerId, this.cardId, this.emmiter)
  }
}
