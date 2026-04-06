import { ActionType, Audience, GameEventType, IGameEvent } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../game-event'
import { ReactionManager } from '../reactions/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { rollDie } from '../../utils/roll-utils'

const COST = 1

export class RollOnHeroAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly heroId: string,
    private readonly reactionManager: ReactionManager,
  ) {}

  getId(): string {
    return this.id
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

  isChallengeable(): boolean {
    return false
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (player.getActionPoints() < COST) return false
    const party = gs.getParty(this.playerId)
    if (!party.getHeroIds().includes(this.heroId)) return false
    if (gs.getAbilitiesUsedThisTurn().includes(this.heroId)) return false
    return true
  }

  execute(gs: GameState): IGameEvent[] {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(COST)

    const baseRoll = rollDie()
    const heroCard = gs.getCard(this.heroId)
    const rollReq = heroCard instanceof HeroCard ? heroCard.getRollReq() : 6

    // Announce the raw roll — modifier window opens next.
    const rollEvent = new GameEvent(
      GameEventType.DiceRolled,
      this.playerId,
      { heroId: this.heroId, baseRoll, rollReq },
      Audience.All,
    )

    // Open the modifier window (5 s).  The ability fires inside ReactionManager
    // once the window resolves, not here.
    this.reactionManager.openModifierWindow({
      rollerId: this.playerId,
      baseRoll,
      rollReq,
      heroId: this.heroId,
    })

    return [rollEvent]
  }
}
