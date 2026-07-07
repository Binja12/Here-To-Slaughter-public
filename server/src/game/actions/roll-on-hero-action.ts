import { ActionType, ReactionWindowType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { ReactionManager } from '../reactions/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { AbilityContext, CTX_LAST_AFFECTED_CARD_ID } from '../ability-context'
import { HeroRollOutcomeTask } from '../tasks/tasks'

export class RollOnHeroAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly emmiter: GameEventEmitter,
    private readonly reactionManager: ReactionManager,
  ) {}

  getId(): string { return this.id }
  getPlayerId(): string { return this.playerId }
  getType(): ActionType { return ActionType.RollOnHero }
  getCost(): number { return 1 }
  isReactable(): boolean { return true }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (player.getActionPoints() <= 0) return false
    const party = gs.getParty(this.playerId)
    if (!party?.getHeroIds().includes(this.cardId)) return false
    if (gs.getAbilitiesUsedThisTurn().includes(this.cardId)) return false
    return true
  }

  execute(gs: GameState): void {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(this.getCost())

    const card = gs.getCard(this.cardId) as HeroCard
    const rollReq = card.getRollReq()
    const baseRoll = Math.floor(Math.random() * 11) + 1

    this.emmiter.emit(GameEventFactory.diceRolled(this.playerId, this.cardId, baseRoll))

    // Mark ability used before the snapshot so rollback doesn't undo it —
    // the hero's ability slot is consumed whether the roll succeeds or fails.
    gs.markAbilityUsed(this.cardId)

    // Open frame + modifier window. ModifierWindow settles the frame:
    // restores on finalRoll < rollReq, releases on success. HeroRollOutcomeTask
    // emits RollSuccess (only reached when frame was released — success path).
    const frameId = this.reactionManager.openFrame()

    // Register outcome pipeline before opening the window (which starts the timer).
    // On restoreFrame the pipeline entry is wiped from the snapshot, so the task
    // only runs on the success path.
    const pipelineCtx = new AbilityContext(this.cardId, this.playerId)
    pipelineCtx.set(CTX_LAST_AFFECTED_CARD_ID, this.cardId)
    gs.abilityPipelines.set(frameId, {
      steps: [new HeroRollOutcomeTask()],
      ctx: pipelineCtx,
    })

    this.reactionManager.openWindow(frameId, ReactionWindowType.Modifier, this.playerId, {
      rollerId: this.playerId,
      baseRoll,
      rollReq,
      heroId: this.cardId,
    })

    // Clear lastFrameId so AbilityProcessor doesn't try to suspend an enclosing pipeline.
    this.reactionManager.takeLastFrameId()
  }
}
