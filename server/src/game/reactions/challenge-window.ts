import {
  Audience,
  GameEventType,
  IGameEventEmitter,
  PassiveType,
  ReactionWindowType,
  RefusalReason,
  RequestResult,
  RollContext,
} from 'shared'
import {
  accepted,
  IModifiableWindow,
  refused,
  RollBonus,
  ValueBias,
  IPassableWindow,
} from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { GameEvent } from '../events/game-event'
import { GameEventFactory } from '../events/game-event-factory'
import { NO_CONTEXT_RESULT } from '../abilities/ability-context'

export class ChallengeWindow implements IModifiableWindow, IPassableWindow {
  /**
   * The clock this window actually runs on. Zero when nothing may contest the
   * card — see GameState.canBeChallenged.
   *
   * A 0ms TIMER rather than resolving inline, for the reason an empty
   * ChoiceWindow uses one: the play that opened this has not returned yet, so
   * settling here would send FrameResolved before anything was parked on it.
   * One tick puts the case back on the ordinary suspend → resolve → resume
   * path, and the card's own steps still fire off the settled frame (§1).
   */
  private readonly clockMs: number
  private timer?: ReturnType<typeof setTimeout>
  private _resolved = false
  private deadline = 0
  private challenged: boolean = false
  private challengerId?: string
  private challengerRoll: number = 0
  private challengedRoll: number = 0
  /**
   * Two rolls, so two lists of RollBonus (see modifier-window.ts). Seeded in
   * startChallenge(): before that there is no roll, and no known challenger.
   */
  private challengerBonuses: RollBonus[] = []
  private challengedBonuses: RollBonus[] = []
  /** Seats that gave the contest up; cleared whenever a card lands in it. */
  private readonly passes = new Set<string>()

  constructor(
    private readonly id: string,
    private readonly challengedId: string,
    private readonly cardId: string,
    private readonly timeoutMs: number,
    private readonly gs: GameState,
    private readonly frameId: string,
    private readonly emitter: IGameEventEmitter,
  ) {
    this.clockMs = gs.canBeChallenged(challengedId, cardId) ? timeoutMs : 0

    this.emitter.emit(
      GameEventFactory.reactionWindowOpened(
        this.getType(),
        this.challengedId,
        this.frameId,
        undefined,
        {
          defenderId: this.challengedId,
          cardId: this.cardId,
          // So the table can see WHY it had no chance to answer.
          challengeable: this.clockMs > 0,
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
    return ReactionWindowType.Challenge
  }

  getRespondentId(): string {
    return this.challengedId
  }

  getOptions(): readonly unknown[] {
    return []
  }

  /** None: a lost challenge restores the frame, so a survivor necessarily won. */
  resultKey(): string | typeof NO_CONTEXT_RESULT {
    return NO_CONTEXT_RESULT
  }

  isOpen(): boolean {
    return !this._resolved
  }

  /** What this window contests. Everything else in the frame was spent INTO it. */
  subjectCardId(): string {
    return this.cardId
  }

  /** Two rolls here, so either participant — but only once a challenge began. */
  acceptsModifierFor(playerId: string): RequestResult {
    if (!this.challenged) return refused(RefusalReason.ChallengeNotStarted)
    if (playerId !== this.challengerId && playerId !== this.challengedId) {
      return refused(RefusalReason.TargetNotInChallenge)
    }
    return accepted()
  }

  /** The contest waits for a card already committed to it, and everyone gets another look. */
  cardSpent(): void {
    this.passes.clear()
    this.resetTimer()
  }

  // --- IPassableWindow ---

  pass(playerId: string): void {
    this.passes.add(playerId)
  }

  passedBy(): readonly string[] {
    return [...this.passes]
  }

  /**
   * Two rolls, so the question is which side was pushed, and the answer is
   * read against the card being contested rather than against the player who
   * spent the modifier: a bonus aimed at the DEFENDER falls low, one aimed at
   * the challenger falls high. An unanswered challenge therefore tips toward
   * the play being defeated.
   */
  valueBiasFor(_playerId: string, targetPlayerId: string): ValueBias {
    return targetPlayerId === this.challengedId ? 'lowest' : 'highest'
  }

  submitReaction(playerId: string, payload: unknown): RequestResult {
    const p = payload as any

    if (p.type === 'challenge') {
      if (this.challenged) return refused(RefusalReason.ChallengeAlreadyStarted)
      this.startChallenge(p.challengerId)
      return accepted()
    }

    if (p.type === 'modifier' && this.challenged) {
      const { value, cardId, targetPlayerId } = p as {
        value: number
        cardId: string
        targetPlayerId: string
      }
      const aimed = this.acceptsModifierFor(targetPlayerId)
      if (!aimed.accepted) return aimed
      const entry: RollBonus = { cardSource: cardId, amount: value }
      const side =
        targetPlayerId === this.challengerId
          ? this.challengerBonuses
          : this.challengedBonuses
      side.push(entry)

      // Same derivation the roll windows use. Two rolls here, so the only
      // difference is which list it lands in: whichever side was aimed at.
      side.push(...this.gs.counterBonusesFor(targetPlayerId, playerId))
      this.passes.clear()
      this.emitter.emit(
        GameEventFactory.modifierAppliedToChallenge(
          playerId,
          value,
          targetPlayerId,
          this.total(this.challengerRoll, this.challengerBonuses),
          this.total(this.challengedRoll, this.challengedBonuses),
        ),
      )
      this.resetTimer()
      return accepted()
    }

    // A modifier before any challenge has started: there are no rolls yet.
    return refused(RefusalReason.ChallengeNotStarted)
  }

  cancel(): void {
    if (this._resolved) return
    this._resolved = true
    if (this.timer) clearTimeout(this.timer)
    this.emitter.emit(
      GameEventFactory.reactionWindowClosed(
        this.getType(),
        this.challengedId,
        this.frameId,
        undefined,
        { cancelled: true },
      ),
    )
  }

  resolve(): void {
    if (this._resolved) return
    this._resolved = true
    if (this.timer) clearTimeout(this.timer)

    if (!this.challenged) {
      // No challenger — card plays uncontested.
      this.emitter.emit(
        GameEventFactory.reactionWindowClosed(
          this.getType(),
          this.challengedId,
          this.frameId,
          true,
          { cardId: this.cardId, contested: false },
        ),
      )
      this.gs.releaseFrame(this.frameId)
      this.emitter.emit(
        GameEventFactory.frameResolved(
          this.frameId,
          [true],
          undefined,
          this.cardId,
        ),
      )
      return
    }

    const challengerFinal = this.total(
      this.challengerRoll,
      this.challengerBonuses,
    )
    const challengedFinal = this.total(
      this.challengedRoll,
      this.challengedBonuses,
    )
    const challengedWins = challengedFinal > challengerFinal

    // Emitted on both paths, so a client tracking open windows never leaks.
    this.emitter.emit(
      GameEventFactory.reactionWindowClosed(
        this.getType(),
        this.challengedId,
        this.frameId,
        challengedWins,
        {
          cardId: this.cardId,
          contested: true,
          challengerFinal,
          challengedFinal,
        },
      ),
    )

    this.emitter.emit(
      GameEventFactory.challengeResolved(
        this.challengedId,
        this.challengerId!,
        this.cardId,
        challengerFinal,
        challengedFinal,
        challengedWins,
      ),
    )

    if (challengedWins) {
      this.gs.releaseFrame(this.frameId)
      // Survived, so it cannot be challenged again this turn. Cleared by
      // TurnManager.startTurn.
      this.gs.markCardChallenged(this.cardId)
    } else {
      this.gs.restoreFrame(this.frameId)
      // AFTER the restore: restoreFrame swaps in the snapshot's discard pile.
      // PlayHeroAction removes the card from hand BEFORE opening the frame, so
      // the rollback leaves it in no zone — this is what puts it somewhere.
      // No CardDiscarded event; ChallengeResolved already reported the defeat.
      // Cards spent during the window need nothing here: restoreFrame put them
      // away already, from the list the frame kept.
      this.gs.addToDiscardPile(this.cardId)
    }

    this.emitter.emit(
      GameEventFactory.frameResolved(
        this.frameId,
        [challengedWins],
        undefined,
        this.cardId,
      ),
    )
  }

  // --- Internal ---

  private total(roll: number, bonuses: RollBonus[]): number {
    return roll + bonuses.reduce((sum, b) => sum + b.amount, 0)
  }

  /**
   * Standing RollBonus effects a player carries into a roll, as sourced
   * entries. "+3 to all of your rolls" means all of them — a challenge roll is
   * a roll, and each side brings its own.
   *
   * Only the CHALLENGER's roll is a roll to challenge, so only that side is
   * asked with the context; the defender is asked about no kind at all and so
   * gets the unscoped effects alone. Defending is not challenging — the Fist
   * of Reason (leader-118) is printed "each time you roll to CHALLENGE".
   * A bonus for defending would be a fourth RollContext, and no card wants one
   * yet.
   */
  private standingBonuses(
    playerId: string,
    rollContext?: RollContext,
  ): RollBonus[] {
    return this.gs
      .getEffects(PassiveType.RollBonus, playerId, undefined, rollContext)
      .map((effect) => ({
        cardSource: effect.sourceCardId,
        amount: effect.value ?? 0,
      }))
  }

  private startChallenge(challengerId: string): void {
    this.challenged = true
    this.challengerId = challengerId
    // A new contest, a new set of seats who may act on it.
    this.passes.clear()
    this.challengerRoll = Math.floor(Math.random() * 11) + 1
    this.challengedRoll = Math.floor(Math.random() * 11) + 1

    // Both sides arrive with whatever standing bonuses they already hold, so
    // the opening totals are the real ones and nobody has to wait for
    // settlement to learn a +3 was in play.
    this.challengerBonuses = this.standingBonuses(
      challengerId,
      RollContext.Challenge,
    )
    this.challengedBonuses = this.standingBonuses(this.challengedId)

    this.emitter.emit(
      GameEventFactory.challengeStarted(
        challengerId,
        this.challengedId,
        this.cardId,
        this.challengerRoll,
        this.challengedRoll,
        [...this.challengerBonuses],
        [...this.challengedBonuses],
      ),
    )
    this.resetTimer()
  }

  /**
   * The contest as it stands: who is defending what, whether anyone may still
   * answer, and — once somebody has — both rolls with their bonuses.
   */
  getDetail(): Record<string, unknown> {
    return {
      defenderId: this.challengedId,
      cardId: this.cardId,
      challengeable: this.clockMs > 0,
      challenged: this.challenged,
      challengerId: this.challengerId,
      challengerRoll: this.challengerRoll,
      challengedRoll: this.challengedRoll,
      challengerBonuses: [...this.challengerBonuses],
      challengedBonuses: [...this.challengedBonuses],
      passedBy: [...this.passes],
    }
  }

  getDeadline(): number {
    return this.deadline
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.deadline = Date.now() + this.clockMs
    this.timer = setTimeout(() => this.resolve(), this.clockMs)
  }
}
