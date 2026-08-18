import { ReactionWindowType } from 'shared'
import { IGameEventEmitter } from 'shared'
import { ChoiceWindow } from './choice-window'
import { GameState } from '../game-state'
import { NO_CONTEXT_RESULT } from '../ability-context'
import { GameEventFactory } from '../events/game-event-factory'

export const CONFIRM = 'confirm'
export const DISMISS = 'dismiss'

// ---------------------------------------------------------------------------
// TaskChoiceWindow — "do you want to do X?" asked before the step that does X.
//
// CONFIRM emits TaskConfirmed; DISMISS emits nothing. "No" is the ABSENCE of
// an event, so there is nothing to cancel and nothing to roll back — the
// window always releases its frame either way.
//
// That is why a confirm is the LAST step of its ability entry: the follow-up
// is a separate entry triggered by TaskConfirmed, so the answer decides whether
// it ever runs. Before this, DISMISS restored the frame and the rollback
// discarded whatever remained parked behind it — which worked, but cancelled
// EVERY later step wholesale, and made a player's answer the one thing besides
// a failed roll or a lost challenge that could rewind state.
//
// A timeout still defaults to DISMISS: an idle player is not committed to an
// effect they never asked for. It simply means no event, like any other "no".
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
     * What is being confirmed — `{ confirms, cardId?, ... }` from whoever
     * opened it. CONFIRM/DISMISS alone cannot be rendered: a client needs to
     * know the question to draw "Roll on Victim?" rather than a bare yes/no.
     */
    /**
     * What is being confirmed: `{ confirms, seq?, ctxSeed?, cardId? }` from
     * whoever opened the window. `confirms` and `seq` are what a continuation
     * trigger matches on; `ctxSeed` is the slots that continuation needs, since
     * it runs with a FRESH context and cannot see this pipeline's blackboard.
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

  /**
   * Deliberately none. CONFIRM releases the frame and DISMISS restores it, so
   * any step that runs afterwards necessarily got CONFIRM — a context key here
   * could only ever hold the constant `true`, and a stray 'confirm' string
   * sitting in the context is exactly what a later card choice must not read.
   */
  override resultKey(): string | typeof NO_CONTEXT_RESULT {
    return NO_CONTEXT_RESULT
  }

  protected override defaultChoice(): unknown {
    return DISMISS
  }

  /**
   * CONFIRM announces itself so a continuation entry can trigger on it.
   * DISMISS says nothing at all — no event, no continuation, nothing undone.
   */
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
