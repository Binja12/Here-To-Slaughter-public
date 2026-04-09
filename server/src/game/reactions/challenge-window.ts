import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { IReactionWindow } from '../interfaces'
import { GameEventFactory } from '../events/game-event-factory'

export class ChallengeWindow implements IReactionWindow {
  private timer?: ReturnType<typeof setTimeout>
  private _resolved = false
  private challenged: boolean = false
  private challengerId?: string
  private challengerRoll: number = 0
  private challengedRoll: number = 0
  private challengerBonus: number = 0
  private challengedBonus: number = 0

  constructor(
    private readonly id: string,
    private readonly challengedId: string,
    private readonly cardId: string,
    private readonly timeoutMs: number,
    private readonly emitter: IGameEventEmitter,
    private readonly onResolve: (challengedWins: boolean) => void,
    private readonly onClose: () => void,
  ) {
    this.emitter.emit(
      GameEventFactory.cardPlayAttempted(this.challengedId, this.cardId),
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

  isOpen(): boolean {
    return !this._resolved
  }

  getCardId(): string {
    return this.cardId
  }

  submitReaction(playerId: string, payload: unknown): void {
    const p = payload as any

    if (p.type === 'challenge') {
      if (this.challenged) return
      this.startChallenge(p.challengerId)
      return
    }

    if (p.type === 'modifier' && this.challenged) {
      const { value, targetPlayerId } = p as {
        value: number
        targetPlayerId: string
      }
      if (targetPlayerId === this.challengerId) {
        this.challengerBonus += value
      } else if (targetPlayerId === this.challengedId) {
        this.challengedBonus += value
      }
      this.emitter.emit(
        GameEventFactory.modifierAppliedToChallenge(
          playerId,
          value,
          targetPlayerId,
          this.challengerRoll + this.challengerBonus,
          this.challengedRoll + this.challengedBonus,
        ),
      )
      this.resetTimer()
    }
  }

  // --- Internal ---

  private startChallenge(challengerId: string): void {
    this.challenged = true
    this.challengerId = challengerId
    this.challengerRoll = Math.ceil(Math.random() * 6)
    this.challengedRoll = Math.ceil(Math.random() * 6)

    this.emitter.emit(
      GameEventFactory.challengeStarted(
        challengerId,
        this.challengedId,
        this.cardId,
        this.challengerRoll,
        this.challengedRoll,
      ),
    )
    this.resetTimer()
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.resolve(), this.timeoutMs)
  }

  resolve(): void {
    if (this._resolved) return
    this._resolved = true
    if (this.timer) clearTimeout(this.timer)
    if (!this.challenged) {
      this.emitter.emit(
        GameEventFactory.challengeWindowClosed(this.challengedId, this.cardId),
      )
      this.onResolve(true)
      this.onClose()
      return
    }

    const challengerFinal = this.challengerRoll + this.challengerBonus
    const challengedFinal = this.challengedRoll + this.challengedBonus
    const challengedWins = challengedFinal > challengerFinal

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

    this.onResolve(challengedWins)
    this.onClose()
  }
}
