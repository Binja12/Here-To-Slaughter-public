import {
  IGameEventEmitter,
  ReactionWindowType,
  RollContext,
} from 'shared'
import { GameState } from '../pipelines/game-state'
import { GameEventFactory } from '../events/game-event-factory'
import { ModifiableRollWindow } from './modifiable-roll-window'

// ---------------------------------------------------------------------------
// The window over a roll to use a HERO card's effect. The bonus list, the
// clock and everything a modifier card does to them are the base class; this
// is the two things only a hero roll knows — what the standing bonuses are
// scoped to, and what beating `rollReq` means.
//
// `rollOnHero` is the only thing that opens it, so every roll it covers is a
// roll for a hero's effect: hence the HeroEffect narrowing below.
// ---------------------------------------------------------------------------

export class ModifierWindow extends ModifiableRollWindow {
  constructor(
    id: string,
    rollerId: string,
    baseRoll: number,
    private readonly rollReq: number,
    private readonly heroId: string,
    timeoutMs: number,
    gs: GameState,
    frameId: string,
    emitter: IGameEventEmitter,
  ) {
    super(id, rollerId, baseRoll, timeoutMs, gs, frameId, emitter)
    // Last statement, and never in the base: the fields above have to exist
    // before the opening payload is built out of them.
    this.open(RollContext.HeroEffect, heroId, { rollReq, heroId })
  }

  getType(): ReactionWindowType {
    return ReactionWindowType.Modifier
  }

  protected closedDetail(): Record<string, unknown> {
    return { rollReq: this.rollReq, heroId: this.heroId }
  }

  /**
   * Short of the requirement rolls the frame back, which is also what cancels
   * whatever paused on it (§3). Meeting it releases and announces the hit —
   * the hero's own entries trigger on `RollSuccess`.
   */
  protected settle(finalRoll: number): void {
    if (finalRoll < this.rollReq) {
      this.gs.restoreFrame(this.frameId)
      // AFTER the restore, so what it fires runs on live state instead of
      // going back with the frame — the Particularly Rusty Coin's draw has to
      // survive the roll that earned it. Same shape as MonsterFoughtBack.
      this.emitter.emit(
        GameEventFactory.rollFailed(this.rollerId, this.heroId),
      )
      return
    }
    this.gs.releaseFrame(this.frameId)
    this.emitter.emit(GameEventFactory.rollSuccess(this.rollerId, this.heroId))
  }
}
