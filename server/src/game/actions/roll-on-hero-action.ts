import { ActionType, Audience, GameEventType, IGameEvent } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../events/game-event'
import { ReactionManager } from '../reactions/reaction-manager'
import { AbilityProcessor } from '../ability-processor'
import { AbilityContext } from '../ability-context'
import { HeroCard } from '../cards/hero-card'

export class RollOnHeroAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
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

  isChallengeable(): boolean {
    return false
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

  execute(gs: GameState): IGameEvent[] {
    const events: IGameEvent[] = []

    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(this.getCost())

    const card = gs.getCard(this.cardId)
    const heroCard = card as HeroCard | undefined
    const rollReq = heroCard?.getRollReq?.() ?? 0
    const ability = heroCard?.getAbility?.()

    const baseRoll = Math.ceil(Math.random() * 6)

    events.push(
      new GameEvent(
        GameEventType.DiceRolled,
        this.playerId,
        { baseRoll, cardId: this.cardId },
        Audience.All,
      ),
    )

    this.reactionManager.openModifierWindow(
      this.playerId,
      baseRoll,
      rollReq,
      this.cardId,
      (finalRoll) => {
        if (finalRoll >= rollReq && ability) {
          const ctx = new AbilityContext(this.cardId, this.playerId)
          const ap = (this.reactionManager as any)
            ._abilityProcessor as AbilityProcessor
          ap?.execute(ability, gs, ctx)
          gs.markAbilityUsed(this.cardId)
        }
      },
    )

    return events
  }
}
