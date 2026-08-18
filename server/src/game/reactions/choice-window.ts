import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { IReactionWindow } from '../interfaces'
import { GameState } from '../game-state'
import { GameEventFactory } from '../events/game-event-factory'
import { NO_CONTEXT_RESULT } from '../ability-context'

// ---------------------------------------------------------------------------
// ChoiceWindow — base for every "pick one of these" window.
//
// One respondent, one submission, single timer. The task filters candidates
// before the window opens; the window holds them and validates the pick.
//
// It ALWAYS releases its frame, on any outcome including a timeout. Rollback
// is for outcomes that FAILED (a roll under its requirement, a lost challenge),
// never for a player declining.
// ---------------------------------------------------------------------------

export abstract class ChoiceWindow implements IReactionWindow {
  protected picked: unknown = undefined
  private timer?: ReturnType<typeof setTimeout>
  private _resolved = false

  constructor(
    private readonly id: string,
    protected readonly respondentId: string,
    protected readonly options: unknown[],
    private readonly timeoutMs: number,
    protected readonly gs: GameState,
    protected readonly frameId: string,
    protected readonly emitter: IGameEventEmitter,
    /**
     * Extra fields for the ReactionWindowOpened payload. A constructor argument,
     * not an override: super() emits before subclass fields are assigned.
     */
    openDetail?: Record<string, unknown>,
  ) {
    // Full option list; the projection layer in front of the API decides who
    // may see what.
    this.emitter.emit(
      GameEventFactory.reactionWindowOpened(
        this.getType(),
        this.respondentId,
        this.frameId,
        this.options,
        openDetail,
      ),
    )

    // Nothing to choose from settles at once, but on a 0ms TIMER — never
    // inline, or the frame would settle before the task that opened it
    // returned and AbilityProcessor would have nothing parked to resume.
    this.timer = setTimeout(
      () => this.resolve(),
      this.options.length === 0 ? 0 : this.timeoutMs,
    )
  }

  // --- IReactionWindow ---

  abstract getType(): ReactionWindowType

  /** No default: every subclass must name its slot or say NO_CONTEXT_RESULT. */
  abstract resultKey(): string | typeof NO_CONTEXT_RESULT

  getId(): string {
    return this.id
  }

  isOpen(): boolean {
    return !this._resolved
  }

  /** payload: { choice: unknown } — must be one of the offered options. */
  submitReaction(playerId: string, payload: unknown): void {
    if (this._resolved) return
    if (playerId !== this.respondentId) return

    const { choice } = (payload ?? {}) as { choice?: unknown }
    if (!this.options.includes(choice)) return

    this.picked = choice
    this.resolve()
  }

  resolve(): void {
    if (this._resolved) return
    this._resolved = true
    if (this.timer) clearTimeout(this.timer)

    // Timed out without a submission — subclasses decide the fallback.
    if (this.picked === undefined) this.picked = this.defaultChoice()

    // The option may have gone stale while the window was open.
    if (this.picked !== undefined && !this.isStillValid(this.picked)) {
      this.picked = undefined
    }

    this.gs.releaseFrame(this.frameId)

    // Arrays, so multi-select needs no migration later.
    const picks = this.picked === undefined ? [] : [this.picked]
    const key = this.resultKey()

    this.emitter.emit(
      GameEventFactory.reactionWindowClosed(
        this.getType(),
        this.respondentId,
        this.frameId,
        picks,
      ),
    )

    // After releaseFrame, before FrameResolved — same ordering ModifierWindow
    // uses for RollSuccess, so anything this triggers sees the frame gone.
    this.announceOutcome(this.picked)

    this.emitter.emit(
      GameEventFactory.frameResolved(
        this.frameId,
        picks,
        key === NO_CONTEXT_RESULT ? undefined : { key, value: picks },
      ),
    )
  }

  // --- Internal ---

  /**
   * What a silent player picked: nothing. TaskChoiceWindow overrides it —
   * a confirm has a meaningful silent answer (DISMISS).
   */
  protected defaultChoice(): unknown {
    return undefined
  }

  /** Emit what this outcome means elsewhere. See TaskChoiceWindow. */
  protected announceOutcome(_picked: unknown): void {}

  /**
   * Re-check a pick at resolve time. Card/player choices override this to
   * confirm the target still exists after other reactions have run.
   */
  protected isStillValid(_choice: unknown): boolean {
    return true
  }

}
