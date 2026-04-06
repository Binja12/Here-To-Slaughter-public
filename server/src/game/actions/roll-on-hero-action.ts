import { ActionType, Audience, GameEventType, IGameEvent } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../events/game-event'
import { ReactionManager } from '../reactions/reaction-manager'
import { AbilityProcessor } from '../ability-processor'
import { AbilityContext } from '../ability-context'
import { HeroCard } from '../cards/hero-card'
import { GameEventEmitter } from '../events/game-event-emitter'

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
    const ability = card.getAbility()
    const baseRoll = Math.ceil(Math.random() * 11) + 1
    if (baseRoll >= card.getRollReq()) {
      const ap = new AbilityProcessor(this.emmiter)
      ap.process(card.getAbility(), gs, ctx)
    }
  }
}
