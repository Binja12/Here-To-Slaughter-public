import { ReactionWindowType } from 'shared'
import { IGameEventEmitter } from 'shared'
import { ChoiceWindow } from './choice-window'
import { GameState } from '../pipelines/game-state'
import { NO_CONTEXT_RESULT } from '../abilities/ability-context'
import { GameEventFactory } from '../events/game-event-factory'

export const CONFIRM = 'confirm'
export const DISMISS = 'dismiss'

// ---------------------------------------------------------------------------
// TaskChoiceWindow — "which of these do you do?", opened by ConfirmTask and
// ChooseActionTask.
//
// Its options are ACTION LABELS. Picking one announces TaskConfirmed with
// that label, which a continuation entry matches with `when`. A timeout
// picks the `silent` label — and announces it like any other: silence DOES
// something, the printed thing (Corrupted Sabretooth: destroy). The one
// label that announces nothing is DISMISS, which makes a confirm the
// two-label case — `confirms` and DISMISS, silence being DISMISS. The frame
// is released either way, so the asking step is the LAST of its entry: what
// follows is a separate entry, triggered by the event.
// ---------------------------------------------------------------------------

export class TaskChoiceWindow extends ChoiceWindow {
  constructor(
    id: string,
    respondentId: string,
    timeoutMs: number,
    gs: GameState,
    frameId: string,
    emitter: IGameEventEmitter,
    /**
     * `{ actions, silent, sourceCardId, cardId?, ctxSeed?, question? }` from
     * the asking task. `actions` are the labels offered, in order; `silent`
     * the one a timeout picks; `ctxSeed` what the continuation needs in its
     * context. ConfirmTask sends `confirms` instead of `actions`: CONFIRM
     * announces that label, DISMISS announces nothing.
     */
    private readonly question: Record<string, unknown> = {},
  ) {
    super(
      id,
      respondentId,
      (question['actions'] as string[] | undefined) ?? [CONFIRM, DISMISS],
      timeoutMs,
      gs,
      frameId,
      emitter,
      question,
    )
  }

  getType(): ReactionWindowType {
    return ReactionWindowType.TaskChoice
  }

  /** None: the answer travels on TaskConfirmed, not through the context. */
  override resultKey(): string | typeof NO_CONTEXT_RESULT {
    return NO_CONTEXT_RESULT
  }

  /** DISMISS among the labels is what makes a question one the player may skip. */
  isOptional(): boolean {
    return this.getOptions().includes(DISMISS)
  }

  /** Silence picks the silent label — DISMISS for a confirm. */
  protected override defaultChoice(): unknown {
    return this.silent()
  }

  /** Every label announces itself, DISMISS excepted. */
  protected override announceOutcome(picked: unknown): void {
    if (picked === undefined || picked === DISMISS) return
    const { confirms, ctxSeed, sourceCardId } = this.question as {
      confirms?: string
      ctxSeed?: Record<string, unknown>
      sourceCardId?: string
    }
    // A confirm's CONFIRM stands for the label it was asked with.
    const label = picked === CONFIRM && confirms ? confirms : (picked as string)
    if (!sourceCardId) return
    this.emitter.emit(
      GameEventFactory.taskConfirmed(
        this.respondentId,
        sourceCardId,
        label,
        ctxSeed,
      ),
    )
  }

  private silent(): string {
    return (this.question['silent'] as string | undefined) ?? DISMISS
  }
}
