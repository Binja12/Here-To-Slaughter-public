import { ActionType, RefusalReason, RequestResult } from 'shared'
import { accepted, IAction, refused } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { PlayMagic } from '../tasks/magic-tasks'
import { ReactionManager } from '../pipelines/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'

const COST = 1

// ---------------------------------------------------------------------------
// The player-request half of playing a magic card. The mechanic itself is
// PlayMagic, in `tasks/magic-tasks.ts`, shared with PlayMagicTask (§1); this
// adds what only a request needs — a price, the guards, a queue identity.
//
// The frameId PlayMagic returns is dropped here: an action has no pipeline to
// suspend, and TurnManager's drain already stops on the open window.
// ---------------------------------------------------------------------------

export class PlayMagicAction extends PlayMagic implements IAction {
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
    return accepted()
  }

  execute(gs: GameState): void {
    // Spent before the frame opens, so a lost challenge still costs the point.
    gs.decreaseActionPoints(this.playerId, COST)
    this.playMagic(
      gs,
      this.playerId,
      this.cardId,
      this.emmiter,
      this.reactionManager,
    )
  }
}
