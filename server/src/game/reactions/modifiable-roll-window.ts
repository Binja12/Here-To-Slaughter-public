import {
  Audience,
  GameEventType,
  IGameEventEmitter,
  PassiveType,
  ReactionWindowType,
  RefusalReason,
  RequestResult,
  RollContext,
  Zone,
} from 'shared'
import {
  accepted,
  IModifiableWindow,
  refused,
  RollBonus,
  ValueBias,
  IPassableWindow,
  ITargetedRollWindow,
} from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { CTX_FINAL_ROLL, NO_CONTEXT_RESULT } from '../abilities/ability-context'
import { GameEvent } from '../events/game-event'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// One roll, one requirement to beat, and a window modifier cards can be spent
// into: ModifierWindow (a hero's effect) and AttackWindow (slaying a monster)
// are the same mechanic pointed at different subjects. Everything that differs
// is a subclass hook — what the standing bonuses are scoped to, what the
// payloads say, and what the number MEANS once the clock runs out.
//
// ChallengeWindow is deliberately not here: it has TWO rolls, so its bonus
// list, its bias rule and its settlement are a different shape.
// ---------------------------------------------------------------------------

export abstract class ModifiableRollWindow
  implements IModifiableWindow, IPassableWindow, ITargetedRollWindow
{
  protected bonuses: RollBonus[] = []
  /**
   * The target the effect chose while this roll stood open, as the slot the
   * card's choose step wrote (TargetRollTask). Shown to the table as the
   * seat it belongs to, and carried to the effect on the settle.
   */
  private target?: { key: string; picks: unknown[]; zone: Zone }
  /** Seats that gave this roll up; cleared whenever a card lands in it. */
  private readonly passes = new Set<string>()
  private timer?: ReturnType<typeof setTimeout>
  private _resolved = false
  private deadline = 0
  /** The subject's own fields, as handed to open(); reread by getDetail. */
  private detail: Record<string, unknown> = {}

  constructor(
    private readonly id: string,
    protected readonly rollerId: string,
    protected readonly baseRoll: number,
    private readonly timeoutMs: number,
    protected readonly gs: GameState,
    protected readonly frameId: string,
    protected readonly emitter: IGameEventEmitter,
  ) {}

  // --- Opening ---

  /**
   * Seeds the standing bonuses, announces the window and starts the clock.
   *
   * The SUBCLASS calls this as the last statement of its own constructor, and
   * not the base: `super()` runs before a subclass's fields are assigned, so a
   * base that announced would emit a payload built out of `undefined`.
   *
   * Seeded at OPEN, not at settlement: a player deciding whether to spend a
   * modifier card must already see the standing bonus counted. `cardId` and
   * `rollContext` are the two narrowings `getEffects` applies — naming nothing
   * for either means every effect of the type qualifies (§7).
   */
  protected open(
    rollContext: RollContext,
    cardId: string | undefined,
    detail: Record<string, unknown>,
  ): void {
    this.detail = detail
    for (const effect of this.gs.getEffects(
      PassiveType.RollBonus,
      this.rollerId,
      cardId,
      rollContext,
    )) {
      this.bonuses.push({
        cardSource: effect.sourceCardId,
        amount: effect.value ?? 0,
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
          ...detail,
        },
      ),
    )
    this.resetTimer()
    this.announceStanding()
  }

  /**
   * What the standing roll means to the effect, announced by the subclass
   * that knows the requirement: a hero roll says RollPassing so its target
   * can be asked while the window stands. Called at open and after every
   * bonus.
   */
  protected announceStanding(): void {}

  /** The chosen target as the seed of the effect's fresh context, if one landed. */
  protected targetSeed(): Record<string, unknown> | undefined {
    return this.target && { [this.target.key]: this.target.picks }
  }

  // --- ITargetedRollWindow ---

  /**
   * The target is known: the table sees it, and everyone gets another look
   * at the roll — the full wait again, passes cleared, the way a card
   * landing does.
   */
  targetChosen(key: string, picks: unknown[], zone: Zone): void {
    this.target = { key, picks, zone }
    this.passes.clear()
    this.resetTimer()
  }

  /**
   * The seat the target belongs to, never the card: a card picked from a
   * hand is that player's secret.
   */
  private targetPlayerId(): string | undefined {
    const [pick] = this.target?.picks ?? []
    if (typeof pick !== 'string') return undefined
    return this.gs.getPlayer(pick) ? pick : this.gs.getCardOwner(pick)
  }

  // --- IReactionWindow ---

  getId(): string {
    return this.id
  }

  getRespondentId(): string {
    return this.rollerId
  }

  /** The roll as it stands now — the bonuses played so far are counted. */
  getDetail(): Record<string, unknown> {
    return {
      rollerId: this.rollerId,
      baseRoll: this.baseRoll,
      bonuses: [...this.bonuses],
      finalRoll: this.getFinalRoll(),
      passedBy: [...this.passes],
      targetPlayerId: this.targetPlayerId(),
      targetZone: this.target?.zone,
      ...this.detail,
    }
  }

  // --- IPassableWindow ---

  pass(playerId: string): void {
    this.passes.add(playerId)
  }

  canPass(_playerId: string): boolean {
    return true
  }

  isOptional(): boolean {
    return false
  }

  passedBy(): readonly string[] {
    return [...this.passes]
  }

  getDeadline(): number {
    return this.deadline
  }

  getOptions(): readonly unknown[] {
    return []
  }

  abstract getType(): ReactionWindowType

  /** One roll here, so only the roller. Asked by PlayModifierReaction. */
  acceptsModifierFor(playerId: string): RequestResult {
    if (playerId !== this.rollerId) {
      return refused(RefusalReason.TargetNotRolling)
    }
    return accepted()
  }

  /** The roll waits for a card already committed to it, and everyone gets another look. */
  cardSpent(): void {
    this.passes.clear()
    this.resetTimer()
  }

  /**
   * One roll, so the question is only whose it is: a player who walked away
   * from a modifier on their OWN roll meant to help it, and one who spent a
   * card on somebody else's meant to hurt it. There is no third case here —
   * `acceptsModifierFor` has already refused anything but the roller.
   */
  valueBiasFor(playerId: string, targetPlayerId: string): ValueBias {
    return targetPlayerId === playerId ? 'highest' : 'lowest'
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
  submitReaction(playerId: string, payload: unknown): RequestResult {
    const { value, cardId, targetPlayerId } = payload as {
      value: number
      cardId: string
      targetPlayerId?: string
    }
    if (targetPlayerId !== undefined) {
      const aimed = this.acceptsModifierFor(targetPlayerId)
      if (!aimed.accepted) return aimed
    }
    this.bonuses.push({ cardSource: cardId, amount: value })
    // What the roller gets back for being modified by somebody else — the
    // Abyss Queen. Pushed BEFORE the announcement, so the finalRoll the table
    // is told already counts it. One roll here, so one list to push into.
    this.bonuses.push(...this.gs.counterBonusesFor(this.rollerId, playerId))
    this.passes.clear()
    this.emitter.emit(
      new GameEvent(
        GameEventType.ModifierApplied,
        playerId,
        { value, cardId, finalRoll: this.getFinalRoll() },
        Audience.All,
      ),
    )
    this.resetTimer()
    this.announceStanding()
    return accepted()
  }

  getFinalRoll(): number {
    return this.baseRoll + this.bonuses.reduce((sum, b) => sum + b.amount, 0)
  }

  // --- Settlement ---

  /**
   * Close, hand the number to the subclass, announce the frame. The order is
   * the shape every window settles in (§3): the outcome is decided and the
   * frame released or restored BEFORE `FrameResolved` wakes what waited on it.
   */
  cancel(): void {
    if (this._resolved) return
    this._resolved = true
    if (this.timer) clearTimeout(this.timer)
    this.emitter.emit(
      GameEventFactory.reactionWindowClosed(
        this.getType(),
        this.rollerId,
        this.frameId,
        undefined,
        { cancelled: true },
      ),
    )
  }

  resolve(): void {
    if (this._resolved) return
    // Not while a question stands over this roll — its target being chosen,
    // a modifier's value. The clock runs again instead; the answer landing
    // restarts it anyway, and a question always settles on its own clock.
    if (this.gs.hasOpenFramesAfter(this.frameId)) return this.resetTimer()
    this._resolved = true
    if (this.timer) clearTimeout(this.timer)

    const finalRoll = this.getFinalRoll()

    this.emitter.emit(
      GameEventFactory.reactionWindowClosed(
        this.getType(),
        this.rollerId,
        this.frameId,
        finalRoll,
        { finalRoll, ...this.closedDetail() },
      ),
    )

    this.settle(finalRoll)

    const key = this.resultKey()
    this.emitter.emit(
      GameEventFactory.frameResolved(
        this.frameId,
        [finalRoll],
        key === NO_CONTEXT_RESULT ? undefined : { key, value: finalRoll },
      ),
    )
  }

  /** What the roll was against, for the closing announcement. */
  protected abstract closedDetail(): Record<string, unknown>

  /**
   * What the number means. Releases or restores the frame — that choice IS the
   * outcome (§3) — and emits whatever the table is owed about it.
   */
  protected abstract settle(finalRoll: number): void

  // --- Internal ---

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.deadline = Date.now() + this.timeoutMs
    this.timer = setTimeout(() => this.resolve(), this.timeoutMs)
  }
}
