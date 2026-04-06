import {
  Audience,
  GameEventType,
  IGameEvent,
  IGameEventEmitter,
  ReactionWindowType,
} from 'shared'
import { IReactionWindow } from '../interfaces'
import { GameEvent } from '../game-event'
import { roll2Dice } from '../../utils/roll-utils'

export class ChallengeWindow implements IReactionWindow {
  private open: boolean = true
  private timer?: ReturnType<typeof setTimeout>
  private challengerId?: string
  private challengerRoll?: number
  private challengedRoll?: number

  constructor(
    private readonly id: string,
    private readonly challengedId: string,
    private readonly challengedCardId: string,
    private readonly timeoutMs: number,
    private readonly emitter: IGameEventEmitter,
    /** Called if the challenge was NOT won by the challenger (i.e. card play succeeds). */
    private readonly onSuccess: () => IGameEvent[],
    /** Called after full resolution — typically unregisters this window + resumes drain. */
    private readonly onClose: () => void,
  ) {
    this.emitter.emit(
      new GameEvent(
        GameEventType.ChallengeWindowOpened,
        this.challengedId,
        { challengedId: this.challengedId, cardId: this.challengedCardId },
        Audience.All,
      ),
    )
    this.startTimer()
  }

  // --- IReactionWindow ---

  getId(): string {
    return this.id
  }

  getType(): ReactionWindowType {
    return ReactionWindowType.Challenge
  }

  isOpen(): boolean {
    return this.open
  }

  /** payload is ignored; playerId is the challenger. */
  submitReaction(playerId: string, _payload: unknown): void {
    this.startChallenge(playerId)
  }

  /** Force-resolve without a challenger (card play succeeds). */
  resolve(): void {
    if (this.timer) clearTimeout(this.timer)
    this.open = false
    this.doResolve(false)
  }

  // --- Public helpers ---

  getChallengedCardId(): string {
    return this.challengedCardId
  }

  getChallengerRoll(): number | undefined {
    return this.challengerRoll
  }

  getChallengedRoll(): number | undefined {
    return this.challengedRoll
  }

  didChallengerWin(): boolean {
    if (this.challengerRoll === undefined || this.challengedRoll === undefined)
      return false
    return this.challengerRoll > this.challengedRoll
  }

  // --- Internal ---

  private startChallenge(challengerId: string): void {
    if (!this.open || this.challengerId) return
    this.challengerId = challengerId
    this.challengedRoll = roll2Dice()
    this.challengerRoll = roll2Dice()

    this.emitter.emit(
      new GameEvent(
        GameEventType.ChallengeStarted,
        challengerId,
        {
          challengerId,
          challengedId: this.challengedId,
          cardId: this.challengedCardId,
          challengerRoll: this.challengerRoll,
          challengedRoll: this.challengedRoll,
        },
        Audience.All,
      ),
    )

    if (this.timer) clearTimeout(this.timer)
    this.open = false
    this.doResolve(this.didChallengerWin())
  }

  private startTimer(): void {
    this.timer = setTimeout(() => {
      this.open = false
      this.doResolve(false) // timeout = no challenger = card play succeeds
    }, this.timeoutMs)
  }

  private doResolve(challengerWon: boolean): void {
    const successEvents = challengerWon ? [] : this.onSuccess()

    this.emitter.emit(
      new GameEvent(
        GameEventType.ChallengeWindowClosed,
        this.challengedId,
        { challengerWon, cardId: this.challengedCardId },
        Audience.All,
      ),
    )

    for (const event of successEvents) this.emitter.emit(event)

    this.emitter.emit(
      new GameEvent(
        GameEventType.ChallengeResolved,
        this.challengedId,
        { challengerWon, cardId: this.challengedCardId },
        Audience.All,
      ),
    )

    this.onClose()
  }
}
