import { ActionType, RefusalReason, RequestResult } from 'shared'
import { accepted, IAction, refused } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { PlayHero } from '../tasks/play-hero-task'
import { ReactionManager } from '../pipelines/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'

const COST = 1

// ---------------------------------------------------------------------------
// The player-request half of playing a hero. The mechanic is PlayHero, in
// `tasks/play-hero-task.ts`, shared with PlayHeroTask (§1); this adds the cost,
// the guards and a queue identity.
//
// The frameId is dropped: an action has no pipeline, and TurnManager's drain
// already stops on the open window.
// ---------------------------------------------------------------------------

export class PlayHeroAction extends PlayHero implements IAction {
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
    return ActionType.PlayHero
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
    this.playHero(
      gs,
      this.playerId,
      this.cardId,
      this.emmiter,
      this.reactionManager,
    )
  }
}
