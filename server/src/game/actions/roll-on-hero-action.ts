import { ActionType, ReactionWindowType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { ReactionManager } from '../pipelines/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'

/** What a roll costs when the player pays for it themselves. */
const COST = 1

/** Cost for a roll granted by another action — PlayHeroAction's free roll. */
export const FREE = 0

export class RollOnHeroAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly emmiter: GameEventEmitter,
    private readonly reactionManager: ReactionManager,
    private readonly cost: number = COST,
  ) {}

  getId(): string { return this.id }
  getPlayerId(): string { return this.playerId }
  getType(): ActionType { return ActionType.RollOnHero }
  getCost(): number { return this.cost }
  isReactable(): boolean { return true }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    // `< cost`, not `<= 0`: a FREE roll is legal at zero AP.
    if (player.getActionPoints() < this.cost) return false
    const party = gs.getParty(this.playerId)
    if (!party?.getHeroIds().includes(this.cardId)) return false
    if (gs.getAbilitiesUsedThisTurn().includes(this.cardId)) return false
    return true
  }

  execute(gs: GameState): void {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(this.cost)

    const card = gs.getCard(this.cardId) as HeroCard
    const rollReq = card.getRollReq()
    const baseRoll = Math.ceil(Math.random() * 11) + 1

    this.emmiter.emit(GameEventFactory.diceRolled(this.playerId, this.cardId, baseRoll))

    // Mark ability used before the snapshot so rollback doesn't undo it —
    // the hero's ability slot is consumed whether the roll succeeds or fails.
    gs.markAbilityUsed(this.cardId)

    // Open frame + modifier window. ModifierWindow owns settlement:
    // rollback on finalRoll < rollReq, RollSuccess + FrameResolved on success.
    const frameId = this.reactionManager.openFrame()
    this.reactionManager.openWindow(frameId, ReactionWindowType.Modifier, this.playerId, {
      rollerId: this.playerId,
      baseRoll,
      rollReq,
      heroId: this.cardId,
    })

    // ModifierWindow emits RollSuccess between releaseFrame and FrameResolved.
    // GameEngine's only job on FrameResolved is resumeDrain().
  }
}
