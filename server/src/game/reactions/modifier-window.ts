import {
  Audience,
  GameEventType,
  IGameEventEmitter,
  ReactionWindowType,
} from 'shared'
import { IReactionWindow } from '../interfaces'
import { GameState } from '../game-state'
import { CTX_FINAL_ROLL, NO_CONTEXT_RESULT } from '../ability-context'
import { GameEvent } from '../events/game-event'
import { GameEventFactory } from '../events/game-event-factory'

export class ModifierWindow implements IReactionWindow {
  private bonuses: number[] = []
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
    this.emitter.emit(
      GameEventFactory.reactionWindowOpened(
        this.getType(),
        this.rollerId,
        this.frameId,
        undefined,
        {
          rollerId: this.rollerId,
          baseRoll: this.baseRoll,
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

  /** Lets later steps branch on the roll — crit bonuses and the like. */
  resultKey(): string | typeof NO_CONTEXT_RESULT {
    return CTX_FINAL_ROLL
  }

  isOpen(): boolean {
    return !this._resolved
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

  getFinalRoll(): number {
    return this.baseRoll + this.bonuses.reduce((sum, b) => sum + b, 0)
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
