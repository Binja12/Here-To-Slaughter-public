import { ActionType, ReactionWindowType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { ReactionManager } from '../reactions/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'

/** What a roll costs when the player pays for it themselves. */
const COST = 1

/**
 * A roll granted by another action rather than bought with an action point —
 * the free roll that comes with playing a hero. Cost is a constructor argument
 * so the free case is the same class with a different price, not a second class
 * or an `isFree` branch inside this one.
 */
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
    // `< cost`, not `<= 0`: a FREE roll must still be legal at zero AP, which
    // is exactly the state playing a hero with the last point leaves you in.
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

    // ModifierWindow — not GameEngine — emits RollSuccess, and does it between
    // releaseFrame and FrameResolved, so an ability triggered by the roll runs
    // with the frame already gone. GameEngine's only job on FrameResolved is
    // resumeDrain().
  }
}
