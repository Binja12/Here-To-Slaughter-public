import {
  Audience,
  GameEventType,
  IGameEventEmitter,
  PassiveType,
  ReactionWindowType,
} from 'shared'
import { IModifiableWindow } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../events/game-event'
import { GameEventFactory } from '../events/game-event-factory'
import { NO_CONTEXT_RESULT } from '../ability-context'
import { RollBonus } from './modifier-window'

export class ChallengeWindow implements IModifiableWindow {
  private timer?: ReturnType<typeof setTimeout>
  private _resolved = false
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

  constructor(
    private readonly id: string,
    private readonly challengedId: string,
    private readonly cardId: string,
    private readonly timeoutMs: number,
    private readonly gs: GameState,
    private readonly frameId: string,
    private readonly emitter: IGameEventEmitter,
  ) {
    this.emitter.emit(
      GameEventFactory.reactionWindowOpened(
        this.getType(),
        this.challengedId,
        this.frameId,
        undefined,
        { defenderId: this.challengedId, cardId: this.cardId },
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

  /** None: a lost challenge restores the frame, so a survivor necessarily won. */
  resultKey(): string | typeof NO_CONTEXT_RESULT {
    return NO_CONTEXT_RESULT
  }

  isOpen(): boolean {
    return !this._resolved
  }

  getCardId(): string {
    return this.cardId
  }

  /** Two rolls here, so either participant — but only once a challenge began. */
  acceptsModifierFor(playerId: string): boolean {
    if (!this.challenged) return false
    return playerId === this.challengerId || playerId === this.challengedId
  }

  submitReaction(playerId: string, payload: unknown): void {
    const p = payload as any

    if (p.type === 'challenge') {
      if (this.challenged) return
      this.startChallenge(p.challengerId)
      return
    }

    if (p.type === 'modifier' && this.challenged) {
      const { value, cardId, targetPlayerId } = p as {
        value: number
        cardId: string
        targetPlayerId: string
      }
      const entry: RollBonus = { cardSource: cardId, amount: value }
      if (targetPlayerId === this.challengerId) {
        this.challengerBonuses.push(entry)
      } else if (targetPlayerId === this.challengedId) {
        this.challengedBonuses.push(entry)
      } else {
        return // names neither side of this challenge
      }
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
    }
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
        GameEventFactory.frameResolved(this.frameId, [true], undefined, this.cardId),
      )
      return
    }

    const challengerFinal = this.total(this.challengerRoll, this.challengerBonuses)
    const challengedFinal = this.total(this.challengedRoll, this.challengedBonuses)
    const challengedWins = challengedFinal > challengerFinal

    // Emitted on both paths, so a client tracking open windows never leaks.
    this.emitter.emit(
      GameEventFactory.reactionWindowClosed(
        this.getType(),
        this.challengedId,
        this.frameId,
        challengedWins,
        { cardId: this.cardId, contested: true, challengerFinal, challengedFinal },
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
      // Cards spent during the window need nothing: burnCard already wrote
      // them into the snapshot's pile.
      this.gs.getDiscardPile().add(this.cardId)
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
   */
  private standingBonuses(playerId: string): RollBonus[] {
    return this.gs
      .getEffects(PassiveType.RollBonus, playerId)
      .map((effect) => ({
        cardSource: effect.sourceCardId,
        amount: effect.value ?? 0,
      }))
  }

  private startChallenge(challengerId: string): void {
    this.challenged = true
    this.challengerId = challengerId
    this.challengerRoll = Math.floor(Math.random() * 11) + 1
    this.challengedRoll = Math.floor(Math.random() * 11) + 1

    // Both sides arrive with whatever standing bonuses they already hold, so
    // the opening totals are the real ones and nobody has to wait for
    // settlement to learn a +3 was in play.
    this.challengerBonuses = this.standingBonuses(challengerId)
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

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.resolve(), this.timeoutMs)
  }
}
