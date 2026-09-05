import { roll2Dice } from '../../utils/roll-utils'
import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext, CTX_CHOSEN_CARD } from '../abilities/ability-context'
import { GameEventFactory } from '../events/game-event-factory'
import { MonsterCard } from '../cards/monster-card'

// ---------------------------------------------------------------------------
// AttackMonster — the mechanic, extended by AttackMonsterAction (actions/) and
// by AttackMonsterTask below (§1). The fourth pair's twin: same shape as
// RollOnHero, pointed at a monster.
// ---------------------------------------------------------------------------

/** Implements neither IAction nor ITask: see PlayMagic in magic-tasks.ts. */
export abstract class AttackMonster {
  /**
   * Dice → `DiceRolled` → attack window. Returns the frameId; a task suspends
   * its pipeline on it, an action drops it.
   *
   * No `markAbilityUsed`: attacking is not a card's once-per-turn slot, it is
   * a price in action points, and a player with the points may attack again.
   *
   * Nothing happens inside the frame here — `AttackWindow` decides the outcome
   * and moves the monster on the branch that earns it. The frame exists so the
   * window has something to settle and a pipeline has something to wait on.
   */
  protected attackMonster(
    gs: GameState,
    playerId: string,
    monsterId: string,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    if (!(gs.getCard(monsterId) instanceof MonsterCard)) return

    const baseRoll = roll2Dice()

    em.emit(GameEventFactory.diceRolled(playerId, monsterId, baseRoll))

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.Attack, playerId, {
      rollerId: playerId,
      baseRoll,
      monsterId,
    })
    return frameId
  }
}

/** Same mechanic as AttackMonsterAction, with no cost and a target read at runtime. */
export class AttackMonsterTask extends AttackMonster implements ITask {
  /** Slot holding the monster to attack. Defaults to the choice slot. */
  constructor(private readonly fromKey: string = CTX_CHOSEN_CARD) {
    super()
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const monsters = ctx.get<string[]>(this.fromKey)

    // Absent = no step ahead was declared to supply a monster.
    if (monsters === undefined) {
      throw new Error(
        `AttackMonsterTask: nothing has written ${this.fromKey} — expected a ` +
          'preceding step to supply a monster.',
      )
    }

    // Empty = the step ahead ran and produced nothing.
    const [monsterId] = monsters
    if (!monsterId) return

    // Discovered at runtime, so the monster may have been slain — or a hero
    // that met its partyReq may have left — since the slot was written. The
    // action's equivalent guard lives in canExecute.
    if (!gs.canAttackMonster(ctx.ownerId, monsterId).accepted) return

    // Returned, so the rest of the declaring card's entry waits on the roll.
    return this.attackMonster(gs, ctx.ownerId, monsterId, em, rm)
  }
}
