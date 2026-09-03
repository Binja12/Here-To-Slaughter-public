import {
  IGameEventEmitter,
  ReactionWindowType,
  RollContext,
  RollResult,
} from 'shared'
import { GameState } from '../pipelines/game-state'
import { GameEventFactory } from '../events/game-event-factory'
import { MonsterCard } from '../cards/monster-card'
import { ModifiableRollWindow } from './modifiable-roll-window'

// ---------------------------------------------------------------------------
// The window over a roll to SLAY a monster — ModifierWindow's opposite number,
// sharing its base (§1: one mechanic, two subjects).
//
// Two things only an attack knows. The standing bonuses are the ATTACK ones —
// the Divine Arrow (leader-116) is the reference — scoped to no card, because
// an effect that names a card means a roll about THAT card and a monster in
// the pile is nobody's. And the number is read by the monster, which answers
// with three outcomes rather than two.
// ---------------------------------------------------------------------------

export class AttackWindow extends ModifiableRollWindow {
  constructor(
    id: string,
    rollerId: string,
    baseRoll: number,
    private readonly monsterId: string,
    timeoutMs: number,
    gs: GameState,
    frameId: string,
    emitter: IGameEventEmitter,
  ) {
    super(id, rollerId, baseRoll, timeoutMs, gs, frameId, emitter)
    // Last statement, and never in the base: see ModifierWindow.
    this.open(RollContext.Attack, undefined, { monsterId })
  }

  getType(): ReactionWindowType {
    return ReactionWindowType.Attack
  }

  protected closedDetail(): Record<string, unknown> {
    return { monsterId: this.monsterId }
  }

  /**
   * Three outcomes, and the monster decides which — `trySlay` holds the
   * comparison, including which way round it runs (RollCompareMode).
   *
   * SLAY releases the frame and hands the monster to `gs.slayMonster`, which
   * owns the whole move — out of the face-up row, into the roller's party, and
   * the next monster drawn up behind it. It moves at settlement rather than
   * inside the frame because there is no rollback to arrange for: the two
   * failing bands leave it exactly where it was. `MonsterSlain` goes out with
   * the monster already in the party, so its own printed entries are live for
   * it.
   *
   * FIGHT BACK and MISS both restore, and the monster stays in the pile. They
   * differ only in what the table is told: a fight-back names the attacker, so
   * the monster's entries can run against them under TriggerScope.Attacker; a
   * miss is the roll falling between the two bands and is announced by nothing
   * beyond the window closing, exactly as a short hero roll is.
   */
  protected settle(finalRoll: number): void {
    const monster = this.gs.getCard(this.monsterId)
    const result =
      monster instanceof MonsterCard
        ? monster.trySlay(finalRoll)
        : RollResult.Miss

    if (result === RollResult.Slay) {
      this.gs.releaseFrame(this.frameId)
      // Out of the row, into the party, and the next monster turned up behind
      // it — one act, and slayMonster announces it.
      this.gs.slayMonster(this.monsterId, this.rollerId, this.emitter)
      return
    }

    this.gs.restoreFrame(this.frameId)

    if (result === RollResult.FightBack) {
      this.emitter.emit(
        GameEventFactory.monsterFoughtBack(this.rollerId, this.monsterId),
      )
    }
  }
}
