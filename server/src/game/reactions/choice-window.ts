import {
  IGameEventEmitter,
  ReactionWindowType,
  RefusalReason,
  RequestResult,
} from 'shared'
import { accepted, IReactionWindow, refused } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { ContextWrite, GameEventFactory } from '../events/game-event-factory'
import { NO_CONTEXT_RESULT } from '../abilities/ability-context'

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
  private deadline = 0

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
    private readonly openDetail: Record<string, unknown> = {},
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
    // returned and TaskManager would have nothing parked to resume.
    const clockMs = this.options.length === 0 ? 0 : this.timeoutMs
    this.deadline = Date.now() + clockMs
    this.timer = setTimeout(() => this.resolve(), clockMs)
  }

  // --- IReactionWindow ---

  abstract getType(): ReactionWindowType

  /** No default: every subclass must name its slot or say NO_CONTEXT_RESULT. */
  abstract resultKey(): string | typeof NO_CONTEXT_RESULT

  getId(): string {
    return this.id
  }

  getRespondentId(): string {
    return this.respondentId
  }

  getOptions(): readonly unknown[] {
    return [...this.options]
  }

  /** A choice asks once and never changes: what it announced is what it asks. */
  getDetail(): Record<string, unknown> {
    return { ...this.openDetail }
  }

  getDeadline(): number {
    return this.deadline
  }

  isOpen(): boolean {
    return !this._resolved
  }

  isOptional(): boolean {
    return false
  }

  /** payload: { choice: unknown } — must be one of the offered options. */
  submitReaction(playerId: string, payload: unknown): RequestResult {
    if (this._resolved) return refused(RefusalReason.NoSuchWindow)
    if (playerId !== this.respondentId)
      return refused(RefusalReason.WrongRespondent)

    const { choice } = (payload ?? {}) as { choice?: unknown }
    // A pick the window never offered is answered with the refusal AND
    // settled by the window itself, on whatever its silence picks (a random
    // option for a card choice): the client only ever sends what it was
    // shown, so a request like this is a client that is out of step, and the
    // table is not held for it (the owner, 2026-09-04).
    if (!this.options.includes(choice)) {
      this.resolve()
      return refused(RefusalReason.NotAnOption)
    }

    // An option the engine offered must still be legal when it is picked.
    // One that is not means this window went stale under the player — an
    // engine mistake, never the player's, so it fails here rather than
    // becoming a reason. The window is left open and its clock untouched.
    if (!this.canSubmit(choice)) {
      throw new Error(
        `${this.constructor.name}: ${String(choice)} was offered and is no ` +
          'longer legal — an offered option must stay legal while the window is open.',
      )
    }

    this.picked = choice
    this.resolve()
    return accepted()
  }

  cancel(): void {
    if (this._resolved) return
    this._resolved = true
    if (this.timer) clearTimeout(this.timer)
    this.emitter.emit(
      GameEventFactory.reactionWindowClosed(
        this.getType(),
        this.respondentId,
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

    // Timed out without a submission — subclasses decide the fallback.
    if (this.picked === undefined) this.picked = this.defaultChoice()

    // The option may have gone stale while the window was open.
    if (this.picked !== undefined && !this.isStillValid(this.picked)) {
      this.picked = undefined
    }

    // A frame may hold one question per seat (ChooseCardEachTask), and it
    // settles when the LAST of them does: the others just close, the last
    // releases the frame and wakes the pipeline with every window's pick in
    // the one FrameResolved. A lone window is its own last. Read before the
    // release, which forgets the frame.
    const all = this.frameChoices()
    const last = all.every((w) => w === this || !w.isOpen())

    if (last) this.gs.releaseFrame(this.frameId)

    this.emitter.emit(
      GameEventFactory.reactionWindowClosed(
        this.getType(),
        this.respondentId,
        this.frameId,
        this.picks(),
      ),
    )

    // After releaseFrame, before FrameResolved — same ordering ModifierWindow
    // uses for RollSuccess, so anything this triggers sees the frame gone.
    this.announceOutcome(this.picked)

    if (!last) return
    const writes = all
      .map((w) => w.contextWrite())
      .filter((w): w is ContextWrite => w !== undefined)
    this.emitter.emit(
      GameEventFactory.frameResolved(
        this.frameId,
        all.flatMap((w) => w.picks()),
        writes.length === 0 ? undefined : writes.length === 1 ? writes[0] : writes,
      ),
    )
  }

  /** Arrays, so multi-select needs no migration later. Empty until resolved with a pick. */
  picks(): unknown[] {
    return this.picked === undefined ? [] : [this.picked]
  }

  /** This window's outcome as the context write it asks for — none when the outcome is not an ability input. */
  contextWrite(): ContextWrite | undefined {
    const key = this.resultKey()
    return key === NO_CONTEXT_RESULT ? undefined : { key, value: this.picks() }
  }

  /** The choice windows of this frame, in the order they were opened; just this one when it was opened outside a frame. */
  private frameChoices(): ChoiceWindow[] {
    const windows = this.gs.getFrames().get(this.frameId)?.windows ?? []
    const choices = windows.filter((w): w is ChoiceWindow => w instanceof ChoiceWindow)
    return choices.includes(this) ? choices : [this]
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
   * Re-check a pick at SUBMIT time. Distinct from `isStillValid`, which runs
   * at resolve and quietly drops a stale pick: this one runs the moment the
   * answer arrives and REFUSES it loudly, so the player can send another.
   *
   * Default yes — being one of the offered options is the whole test for most
   * windows. MonsterChoiceWindow overrides it.
   */
  protected canSubmit(_choice: unknown): boolean {
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
