import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext } from '../abilities/ability-context'
import { GameEventFactory } from '../events/game-event-factory'
import { HeroCard } from '../cards/hero-card'

// ---------------------------------------------------------------------------
// RollOnHero — the mechanic, extended by RollOnHeroAction (actions/) and by
// RollOnHeroTask below (§1).
// ---------------------------------------------------------------------------

/** Implements neither IAction nor ITask: see PlayMagic in magic-tasks.ts. */
export abstract class RollOnHero {
  /**
   * Dice → `DiceRolled` → modifier window. Returns the frameId; a task
   * suspends its pipeline on it, an action drops it.
   *
   * ORDER: `markAbilityUsed` before `openFrame`, so a failed roll keeps the
   * slot spent. ModifierWindow owns settlement and emits `RollSuccess`.
   */
  protected rollOnHero(
    gs: GameState,
    playerId: string,
    heroId: string,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const hero = gs.getCard(heroId)
    if (!(hero instanceof HeroCard)) return

    const rollReq = hero.getRollReq()
    const baseRoll = Math.ceil(Math.random() * 11) + 1

    em.emit(GameEventFactory.diceRolled(playerId, heroId, baseRoll))

    gs.markAbilityUsed(heroId)

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.Modifier, playerId, {
      rollerId: playerId,
      baseRoll,
      rollReq,
      heroId,
    })
    return frameId
  }
}

/** Same mechanic as RollOnHeroAction, with no cost and a target read at runtime. */
export class RollOnHeroTask extends RollOnHero implements ITask {
  /** Slot holding the hero to roll on. Absent = the entry's own source card. */
  constructor(private readonly fromKey?: string) {
    super()
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const heroId = this.fromKey
      ? this.read(ctx, this.fromKey)[0]
      : ctx.sourceCardId

    // Empty = the step ahead ran and produced nothing.
    if (!heroId) return

    // Returned, so the rest of the declaring card's entry waits on the roll.
    return this.rollOnHero(gs, ctx.ownerId, heroId, em, rm)
  }

  /** Absent = no step ahead was declared to supply a hero. */
  private read(ctx: AbilityContext, key: string): string[] {
    const value = ctx.get<string[]>(key)
    if (value === undefined) {
      throw new Error(
        `RollOnHeroTask: nothing has written ${key} — expected a preceding ` +
          'step to supply a hero.',
      )
    }
    return value
  }
}
