import { ActionType, RefusalReason, RequestResult } from 'shared'
import { IAction, refused } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { PlayItem } from '../tasks/item-tasks'
import { ReactionManager } from '../pipelines/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'

const COST = 1

// ---------------------------------------------------------------------------
// The player-request half of playing an item. The mechanic itself is PlayItem,
// in `tasks/item-tasks.ts`, shared with PlayItemTask (§1); this adds what only
// a request needs — a price, the guards, a queue identity.
// ---------------------------------------------------------------------------

export class PlayItemAction extends PlayItem implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly targetHeroId: string,
    private readonly reactionManager: ReactionManager,
    private readonly emmiter: GameEventEmitter,
  ) {
    super()
  }

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.PlayItem
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }
  isReactable(): boolean {
    return true
  }

  canExecute(gs: GameState): RequestResult {
    if (gs.getActionPoints(this.playerId) < COST) {
      return refused(RefusalReason.NoActionPoints)
    }
    if (!gs.hasInHand(this.playerId, this.cardId)) {
      return refused(RefusalReason.CardNotInHand)
    }

    return this.canEquip(gs, this.playerId, this.cardId, this.targetHeroId)
  }

  execute(gs: GameState): void {
    gs.decreaseActionPoints(this.playerId, COST)
    this.playItem(
      gs,
      this.playerId,
      this.cardId,
      this.targetHeroId,
      this.emmiter,
      this.reactionManager,
    )
  }
}
