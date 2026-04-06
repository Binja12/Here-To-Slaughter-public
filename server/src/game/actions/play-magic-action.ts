import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { ReactionManager } from '../reactions/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { AbilityContext } from '../ability-context'
import { MagicCard } from '../cards/magic-card'

const COST = 1

export class PlayMagicAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly reactionManager: ReactionManager,
    private readonly emmiter: GameEventEmitter,
  ) {}

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

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (gs.getCurrentPlayerId() !== this.playerId) return false
    if (player.getActionPoints() < COST) return false
    if (!player.getHand().includes(this.cardId)) return false
    return true
  }

  execute(gs: GameState): void {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(COST)
    player.removeFromHand(this.cardId)
    this.emmiter.emit(
      GameEventFactory.cardRemovedFromHand(this.playerId, this.cardId),
    )

    // Run the magic card's ability tasks directly — magic is one-shot and never
    // registered with the AbilityProcessor. Events emitted here will still be
    // picked up by any registered passives listening on the emitter.
    const card = gs.getCard(this.cardId)! as MagicCard
    const ability = card.getAbility()
    const ctx = new AbilityContext(this.cardId, this.playerId)
    for (const task of ability.steps) {
      task.execute(gs, ctx, this.emmiter)
    }

    gs.getDiscardPile().add(this.cardId)
    this.emmiter.emit(
      GameEventFactory.cardDiscarded(this.playerId, this.cardId),
    )
  }
}
