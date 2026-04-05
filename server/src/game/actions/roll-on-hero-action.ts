import {
  ActionType,
  Audience,
  GameEventType,
  IGameEvent,
  RollResult,
} from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../game-event'
import { AbilityProcessor } from '../ability-processor'
import { AbilityContext } from '../ability-context'
import { HeroCard } from '../cards/hero-card'

const COST = 1

export class RollOnHeroAction implements IAction {
  constructor(
    private playerId: string,
    private heroId: string,
    private abilityProcessor: AbilityProcessor,
  ) {}

  getId(): string {
    return `roll-hero-${this.heroId}-${Date.now()}`
  }

  getType(): ActionType {
    return ActionType.RollOnHero
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }

  canExecute(gs: GameState): boolean {
    const party = gs.getParty(this.playerId)
    if (!party.getHeroIds().includes(this.heroId)) return false
    if (gs.getAbilitiesUsedThisTurn().includes(this.heroId)) return false
    return true
  }

  execute(gs: GameState): IGameEvent[] {
    const events: IGameEvent[] = []

    const roll = Math.floor(Math.random() * 6) + 1
    const heroCard = gs.getCard(this.heroId)
    const rollReq = heroCard instanceof HeroCard ? heroCard.getRollReq() : 6
    const result = roll >= rollReq ? RollResult.Success : RollResult.Failure

    events.push(
      new GameEvent(
        GameEventType.DiceRolled,
        this.playerId,
        { heroId: this.heroId, roll, result },
        Audience.All,
      ),
    )

    if (result === RollResult.Success) {
      const ability = gs.getHeroAbility(this.heroId)
      if (ability) {
        const ctx = new AbilityContext(this.heroId, this.playerId)
        events.push(...this.abilityProcessor.process(ability, gs, ctx))
      }
      gs.markAbilityUsed(this.heroId)
    }

    return events
  }
}
