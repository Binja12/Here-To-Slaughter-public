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

/** One contribution to a roll: standing effects and played cards share a list. */
export type RollBonus = {
  /** The effect's source card, or the modifier played. Card ids are per copy. */
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
    // Seeded at OPEN, not at settlement: a player deciding whether to spend a
    // modifier card must already see the standing bonus counted.
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
          // Copied: an emitted payload must not change on a later submission.
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

  /** One roll here, so only the roller. Asked by PlayModifierReaction. */
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
   * payload: { value, cardId, targetPlayerId? }. `targetPlayerId` exists for
   * challenges, which have two rolls; here only the roller is valid, and
   * anything else is refused rather than thrown (player input off a socket).
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
