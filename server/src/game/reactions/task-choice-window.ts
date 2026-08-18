import { ReactionWindowType } from 'shared'
import { IGameEventEmitter } from 'shared'
import { ChoiceWindow } from './choice-window'
import { GameState } from '../game-state'
import { NO_CONTEXT_RESULT } from '../ability-context'
import { GameEventFactory } from '../events/game-event-factory'

export const CONFIRM = 'confirm'
export const DISMISS = 'dismiss'

// ---------------------------------------------------------------------------
// TaskChoiceWindow — "do you want to do X?", opened by ConfirmTask.
//
// CONFIRM emits TaskConfirmed; DISMISS (and a timeout) emits nothing. The
// frame is released either way. A confirm is therefore the LAST step of its
// ability entry — the follow-up is a separate entry triggered by that event.
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
     * `{ confirms, sourceCardId, cardId?, ctxSeed? }` from ConfirmTask.
     * `confirms` becomes the event's `label`, which a continuation matches
     * with `when`; `ctxSeed` is what that continuation needs in its context.
     */
    private readonly question: Record<string, unknown> = {},
  ) {
    super(
      id,
      respondentId,
      [CONFIRM, DISMISS],
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

  protected override defaultChoice(): unknown {
    return DISMISS
  }

  /** CONFIRM announces itself; DISMISS says nothing. */
  protected override announceOutcome(picked: unknown): void {
    if (picked !== CONFIRM) return
    const { confirms: label, ctxSeed, sourceCardId } = this.question as {
      confirms?: string
      ctxSeed?: Record<string, unknown>
      sourceCardId?: string
    }
    if (!label || !sourceCardId) return
    this.emitter.emit(
      GameEventFactory.taskConfirmed(
        this.respondentId,
        sourceCardId,
        label,
        ctxSeed,
      ),
    )
  }
}
