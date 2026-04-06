import {
  Audience,
  GameEventType,
  IGameEvent,
  IGameEventEmitter,
  ReactionWindowType,
} from 'shared'
import { IReactionWindow } from '../interfaces'
import { GameEvent } from '../events/game-event'

export class ModifierWindow implements IReactionWindow {
  private bonuses: number[] = []
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly id: string,
    private readonly rollerId: string,
    private readonly baseRoll: number,
    private readonly rollReq: number,
    private readonly heroId: string,
    private readonly timeoutMs: number,
    private readonly emitter: IGameEventEmitter,
    /** Called when the window resolves; receives the final roll; returns events to emit. */
    private readonly onSuccess: (finalRoll: number) => IGameEvent[],
    /** Called after full resolution — typically unregisters this window + resumes drain. */
    private readonly onClose: () => void,
  ) {
    this.emitter.emit(
      new GameEvent(
        GameEventType.ModifierWindowOpened,
        this.rollerId,
        {
          rollerId: this.rollerId,
          baseRoll: this.baseRoll,
          rollReq: this.rollReq,
          heroId: this.heroId,
        },
        Audience.All,
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

  /** payload: { value: number } — the modifier bonus to apply. */
  submitReaction(playerId: string, payload: unknown): void {
    const { value } = payload as { value: number }
    this.bonuses.push(value)
    this.emitter.emit(
      new GameEvent(
        GameEventType.ModifierApplied,
        playerId,
        { value, finalRoll: this.getFinalRoll() },
        Audience.All,
      ),
    )
    this.resetTimer()
  }

  // --- Public helpers ---

  getFinalRoll(): number {
    return this.baseRoll + this.bonuses.reduce((sum, b) => sum + b, 0)
  }

  // --- Internal ---

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.resolve()
    }, this.timeoutMs)
  }

  private resolve(): void {
    const finalRoll = this.getFinalRoll()
    const successEvents = this.onSuccess(finalRoll)

    this.emitter.emit(
      new GameEvent(
        GameEventType.ModifierWindowClosed,
        this.rollerId,
        { finalRoll, rollReq: this.rollReq, heroId: this.heroId },
        Audience.All,
      ),
    )

    for (const event of successEvents) this.emitter.emit(event)

    this.emitter.emit(
      new GameEvent(
        GameEventType.ModifierResolved,
        this.rollerId,
        { finalRoll, rollReq: this.rollReq, heroId: this.heroId },
        Audience.All,
      ),
    )

    this.onClose()
  }
}
