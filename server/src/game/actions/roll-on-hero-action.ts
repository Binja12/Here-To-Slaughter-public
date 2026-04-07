import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { ReactionManager } from '../reactions/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'

export class RollOnHeroAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly emmiter: GameEventEmitter,
    private readonly reactionManager: ReactionManager,
  ) {}

  getId(): string {
    return this.id
  }
  getPlayerId(): string {
    return this.playerId
  }

  getType(): ActionType {
    return ActionType.RollOnHero
  }

  getCost(): number {
    return 1
  }

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
    const baseRoll = Math.ceil(Math.random() * 11) + 1
    this.emmiter.emit(
      GameEventFactory.diceRolled(this.playerId, this.cardId, baseRoll),
    )
    if (baseRoll >= card.getRollReq()) {
      gs.markAbilityUsed(this.cardId)
      this.emmiter.emit(
        GameEventFactory.rollSuccess(this.playerId, this.cardId),
      )
    }
  }
}
