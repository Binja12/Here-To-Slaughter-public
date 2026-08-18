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
// A choice window ALWAYS releases its frame — there is no bad outcome here:
//
//   releaseFrame()                    → suspended pipeline survives and resumes
//   frameResolved(frameId, [picked])  → picks may be empty
//
// It once had a failure branch that restored instead, used only by
// TaskChoiceWindow's DISMISS. That is gone: a confirm now announces CONFIRM
// with a TaskConfirmed event and says nothing on DISMISS, so "no" needs no
// rollback — the continuation entry simply never triggers. Rollback goes back
// to meaning what it always did: an outcome that FAILED (a roll under its
// requirement, a lost challenge), never a player declining an offer.
//
// A timeout resolves the same way, with no pick. Restoring would rewind the
// step that opened the window, and since the window is not in the snapshot that
// step would re-run and re-open it — an AFK player would loop forever.
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
     * Extra fields for the ReactionWindowOpened payload. A constructor argument
     * rather than an overridable method: the base constructor emits that event,
     * and a subclass's own parameter properties are not assigned until after
     * super() returns — an override would read undefined every time.
     */
    openDetail?: Record<string, unknown>,
  ) {
    // One public event. WHO may see these options is decided downstream by the
    // projection layer in front of the API, not here.
    this.emitter.emit(
      GameEventFactory.reactionWindowOpened(
        this.getType(),
        this.respondentId,
        this.frameId,
        this.options,
        openDetail,
      ),
    )

    // Nothing to choose from — settle at once rather than hanging the pipeline
    // for a full timeout, but on a 0ms TIMER, never inline.
    //
    // Resolving inside the constructor would settle the frame before the task
    // that opened it had even returned, so AbilityProcessor had not parked the
    // remainder yet: the FrameResolved went out with nobody listening, the
    // context never received the empty result, and the frameId handed back was
    // already dead. Deferring by one tick puts this case back on the ordinary
    // path — suspend, resolve, resume — so the empty result reaches the context
    // like every other outcome and the steps behind it simply read an empty
    // pick. That is what let STOP_PIPELINE and suspendOn be deleted.
    this.timer = setTimeout(
      () => this.resolve(),
      this.options.length === 0 ? 0 : this.timeoutMs,
    )
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

    this.gs.releaseFrame(this.frameId)

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

    // Domain event before the lifecycle one, mirroring ModifierWindow emitting
    // RollSuccess between releaseFrame and FrameResolved: whatever the outcome
    // triggers starts with this frame already gone.
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

  /** Fallback when the window times out. Defaults to a random option. */
  /**
   * What a silent player is taken to have picked: NOTHING.
   *
   * This used to pick at random from the options, which committed an idle
   * player to a target they never named. It also must not RESTORE — a timeout
   * that rolled the frame back would rewind the action that opened the window,
   * and since the window is not in the snapshot the same step would simply run
   * again, re-open the window, and time out again. An AFK player would loop
   * forever. So a timeout resolves like any other outcome; it just carries no
   * pick, and the steps behind it read an empty choice.
   *
   * TaskChoiceWindow still overrides this: a confirm prompt HAS a meaningful
   * silent answer (DISMISS), and its rollback ends the pipeline rather than
   * re-running anything.
   */
  protected defaultChoice(): unknown {
    return undefined
  }

  /**
   * Emit whatever this window's outcome means to the rest of the game. The
   * base has nothing to say — release-vs-restore already carries a plain
   * choice's meaning.
   */
  protected announceOutcome(_picked: unknown): void {}

  /**
   * Re-check a pick at resolve time. Card/player choices override this to
   * confirm the target still exists after other reactions have run.
   */
  protected isStillValid(_choice: unknown): boolean {
    return true
  }

}
