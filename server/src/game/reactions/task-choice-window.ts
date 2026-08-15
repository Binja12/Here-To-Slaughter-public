import { ReactionWindowType } from 'shared'
import { IGameEventEmitter } from 'shared'
import { ChoiceWindow } from './choice-window'
import { GameState } from '../game-state'
import { NO_CONTEXT_RESULT } from '../ability-context'

export const CONFIRM = 'confirm'
export const DISMISS = 'dismiss'

// ---------------------------------------------------------------------------
// TaskChoiceWindow — "do you want to do X?" asked BEFORE a task fires.
//
// DISMISS is treated as the window's failure case, exactly like a modifier
// roll under its requirement or a lost challenge: the frame is restored rather
// than released, and because abilityPipelines lives inside the snapshot, the
// rollback takes the suspended pipeline with it. That is what stops the rest
// of the ability — no cancellation flag anywhere.
//
// Because it gates an opt-in effect, a timeout defaults to DISMISS rather than
// a coin flip — an idle player should not be committed to an action they never
// asked for.
// ---------------------------------------------------------------------------

export class TaskChoiceWindow extends ChoiceWindow {
  constructor(
    id: string,
    respondentId: string,
    timeoutMs: number,
    gs: GameState,
    frameId: string,
    emitter: IGameEventEmitter,
  ) {
    super(id, respondentId, [CONFIRM, DISMISS], timeoutMs, gs, frameId, emitter)
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

  /** DISMISS is the failure case — it rolls the frame back. */
  protected override isSuccess(picked: unknown): boolean {
    return picked === CONFIRM
  }
}
