import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { RollOnHero } from '../tasks/roll-on-hero-task'
import { ReactionManager } from '../pipelines/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'

const COST = 1

// ---------------------------------------------------------------------------
// The player-request half of rolling on a hero. The mechanic is RollOnHero, in
// `tasks/roll-on-hero-task.ts`, shared with RollOnHeroTask (§1); this adds the
// cost, the guards and a queue identity.
//
// The frameId is dropped: an action has no pipeline, and TurnManager's drain
// already stops on the open window.
// ---------------------------------------------------------------------------

export class RollOnHeroAction extends RollOnHero implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly emmiter: GameEventEmitter,
    private readonly reactionManager: ReactionManager,
  ) {
    super()
  }

  getId(): string { return this.id }
  getPlayerId(): string { return this.playerId }
  getType(): ActionType { return ActionType.RollOnHero }
  getCost(): number { return COST }
  isReactable(): boolean { return true }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (player.getActionPoints() < COST) return false
    const party = gs.getParty(this.playerId)
    if (!party?.getHeroIds().includes(this.cardId)) return false
    if (gs.getAbilitiesUsedThisTurn().includes(this.cardId)) return false
    // A sealed hero has no effect to roll for — the Sealing Key (item-076).
    if (!gs.canUseHeroEffect(this.playerId, this.cardId)) return false
    return true
  }

  execute(gs: GameState): void {
    // Spent before the frame opens, so a failed roll still costs the point.
    gs.getPlayer(this.playerId)!.decreaseActionPoints(COST)
    this.rollOnHero(
      gs,
      this.playerId,
      this.cardId,
      this.emmiter,
      this.reactionManager,
    )
  }
}
