import {
  Audience,
  GameEventType,
  IGameEventEmitter,
  PassiveType,
  ReactionWindowType,
} from 'shared'
import { IModifiableWindow } from '../interfaces'
import { GameState } from '../game-state'
import { CTX_FINAL_ROLL, NO_CONTEXT_RESULT } from '../ability-context'
import { GameEvent } from '../events/game-event'
import { GameEventFactory } from '../events/game-event-factory'

/**
 * One contribution to a roll, and the card answerable for it.
 *
 * A standing effect and a played modifier card are both just bonuses, so they
 * share one list — the roll is `baseRoll` plus every amount here. What the UI
 * needs is not two lists but the SOURCE on each entry, so it can show
 * "+3 Wise Shield, +5 Fireball" instead of an unattributable "+8".
 */
export type RollBonus = {
  /**
   * Card answerable for this contribution — the effect's source card, or the
   * modifier played.
   *
   * Enough on its own to tell two contributions apart: card ids are per COPY,
   * not per design. The base set carries 136 records for 136 physical cards —
   * 25 separate ids all named "Modifier" — so two copies of one +2 magic card
   * are two different ids, and playing both reads as two entries.
   */
  cardSource: string
  amount: number
}

export class ModifierWindow implements IModifiableWindow {
  private bonuses: RollBonus[] = []
  private timer?: ReturnType<typeof setTimeout>
  private _resolved = false

  constructor(
    private readonly id: string,
    private readonly rollerId: string,
    private readonly baseRoll: number,
    private readonly rollReq: number,
    private readonly heroId: string,
    private readonly timeoutMs: number,
    private readonly gs: GameState,
    private readonly frameId: string,
    private readonly emitter: IGameEventEmitter,
  ) {
    // Standing bonuses (Wise Shield's +3) are seeded the moment the window
    // opens, not folded in at settlement. Timing is the point: the client draws
    // base / bonuses / total as soon as the window appears, and a player
    // deciding whether to spend a modifier card must see the +3 already
    // counted. Each keeps its own source, so the UI can attribute it.
    for (const effect of gs.getEffectsWithPassive(PassiveType.RollBonus, rollerId)) {
      this.bonuses.push({
        cardSource: effect.sourceCardId,
        amount: effect.passive?.value ?? 0,
      })
    }

    this.emitter.emit(
      GameEventFactory.reactionWindowOpened(
        this.getType(),
        this.rollerId,
        this.frameId,
        undefined,
        {
          rollerId: this.rollerId,
          baseRoll: this.baseRoll,
          // COPIED, not the live array: the payload of an event already emitted
          // must not change when a later modifier is played into this window.
          bonuses: [...this.bonuses],
          finalRoll: this.getFinalRoll(),
          rollReq: this.rollReq,
          heroId: this.heroId,
        },
      ),
    )
    this.resetTimer()
  }

  // --- IReactionWindow ---

  getId(): string {
    return this.id
  }

  getType(): ReactionWindowType {
    return ReactionWindowType.Modifier
  }

  /**
   * Does a modifier aimed at `playerId` belong in this window?
   *
   * A plain roll has exactly ONE roll, so only the roller qualifies. Asked by
   * PlayModifierReaction before it burns the card — the window owns the rule,
   * the reaction just consults it, so neither has to know the other's shape.
   */
  acceptsModifierFor(playerId: string): boolean {
    return playerId === this.rollerId
  }

  /** Lets later steps branch on the roll — crit bonuses and the like. */
  resultKey(): string | typeof NO_CONTEXT_RESULT {
    return CTX_FINAL_ROLL
  }

  isOpen(): boolean {
    return !this._resolved
  }

  /**
   * payload: { value, cardId, targetPlayerId? } — the bonus, the card spent for
   * it, and optionally whose roll it is meant for.
   *
   * A plain roll has exactly ONE roll, the roller's, so the only sensible
   * target is `rollerId`; `targetPlayerId` exists because a CHALLENGE has two.
   * Naming anyone else is malformed, and was previously applied to the roller
   * anyway — a modifier aimed at an opponent silently helped the person it was
   * played against. Refused here rather than thrown: this is player input off a
   * socket, and a window validating a submission is how the choice windows
   * behave too.
   */
  submitReaction(playerId: string, payload: unknown): void {
    const { value, cardId, targetPlayerId } = payload as {
      value: number
      cardId: string
      targetPlayerId?: string
    }
    if (targetPlayerId !== undefined && targetPlayerId !== this.rollerId) return
    this.bonuses.push({ cardSource: cardId, amount: value })
    this.emitter.emit(
      new GameEvent(
        GameEventType.ModifierApplied,
        playerId,
        { value, cardId, finalRoll: this.getFinalRoll() },
        Audience.All,
      ),
    )
    this.resetTimer()
  }

  getFinalRoll(): number {
    return this.baseRoll + this.bonuses.reduce((sum, b) => sum + b.amount, 0)
  }

  resolve(): void {
    if (this._resolved) return
    this._resolved = true
    if (this.timer) clearTimeout(this.timer)

    const finalRoll = this.getFinalRoll()

    this.emitter.emit(
      GameEventFactory.reactionWindowClosed(
        this.getType(),
        this.rollerId,
        this.frameId,
        finalRoll,
        { finalRoll, rollReq: this.rollReq, heroId: this.heroId },
      ),
    )

    if (finalRoll < this.rollReq) {
      this.gs.restoreFrame(this.frameId)
    } else {
      this.gs.releaseFrame(this.frameId)
      this.emitter.emit(GameEventFactory.rollSuccess(this.rollerId, this.heroId))
    }

    const key = this.resultKey()
    this.emitter.emit(
      GameEventFactory.frameResolved(
        this.frameId,
        [finalRoll],
        key === NO_CONTEXT_RESULT ? undefined : { key, value: finalRoll },
      ),
    )
  }

  // --- Internal ---

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.resolve(), this.timeoutMs)
  }
}
