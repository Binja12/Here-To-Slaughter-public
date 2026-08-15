import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { IReactionWindow } from '../interfaces'
import { GameState } from '../game-state'
import { GameEventFactory } from '../events/game-event-factory'
import { NO_CONTEXT_RESULT } from '../ability-context'

// ---------------------------------------------------------------------------
// ChoiceWindow — base for every "pick one of these" window.
//
// Unlike ModifierWindow, a choice has exactly ONE respondent and accepts
// exactly ONE submission, so it resolves on submit and never extends its
// timer. Candidate selection happens before the window opens (the task owns
// the filtering); the window only holds the options and validates the pick.
//
// Settlement follows ModifierWindow/ChallengeWindow exactly:
//
//   good outcome → releaseFrame()  → suspended pipeline survives and resumes
//   bad outcome  → restoreFrame()  → snapshot rollback also drops the pipeline
//   always       → frameResolved(frameId, [picked])
//
// A plain card/player choice has no bad outcome, so it always releases.
// TaskChoiceWindow overrides isSuccess() so DISMISS rolls back instead —
// which is what cancels the rest of the ability, with no extra machinery.
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
  ) {
    // One public event. WHO may see these options is decided downstream by the
    // projection layer in front of the API, not here.
    this.emitter.emit(
      GameEventFactory.reactionWindowOpened(
        this.getType(),
        this.respondentId,
        this.frameId,
        this.options,
      ),
    )

    // Nothing to choose from — don't hang the pipeline for the full timeout.
    if (this.options.length === 0) {
      this.resolve()
      return
    }

    this.timer = setTimeout(() => this.resolve(), this.timeoutMs)
  }

  // --- IReactionWindow ---

  abstract getType(): ReactionWindowType

  /**
   * Abstract on purpose — no default. A subclass that inherited "no result"
   * by silence would drop the player's pick without any error, and the failure
   * would surface much later as a downstream task complaining about a missing
   * target. Every subclass must name its slot or say NO_CONTEXT_RESULT.
   */
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

    if (this.isSuccess(this.picked)) {
      this.gs.releaseFrame(this.frameId)
    } else {
      this.gs.restoreFrame(this.frameId)
    }

    // Arrays here — a choice may become multi-select, and starting single
    // would mean migrating every consumer later.
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

    this.emitter.emit(
      GameEventFactory.frameResolved(
        this.frameId,
        picks,
        key === NO_CONTEXT_RESULT ? undefined : { key, value: picks },
      ),
    )
  }

  // --- Internal ---

  /** Fallback when the window times out. Defaults to a random option. */
  protected defaultChoice(): unknown {
    if (this.options.length === 0) return undefined
    return this.options[Math.floor(Math.random() * this.options.length)]
  }

  /**
   * Whether the resolved pick counts as a success. False rolls the frame back,
   * which discards any ability pipeline suspended on it — the same mechanism a
   * failed modifier roll or a lost challenge uses to abort an ability.
   */
  protected isSuccess(_picked: unknown): boolean {
    return true
  }

  /**
   * Re-check a pick at resolve time. Card/player choices override this to
   * confirm the target still exists after other reactions have run.
   */
  protected isStillValid(_choice: unknown): boolean {
    return true
  }

}
