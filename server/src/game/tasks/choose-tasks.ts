import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../game-state'
import { AbilityContext } from '../ability-context'
import {
  CardFilter,
  PlayerFilter,
  filterCards,
  filterPlayers,
} from '../reactions/choice-filters'

// ---------------------------------------------------------------------------
// Choose tasks — resolve candidates from GameState, open a choice window and
// suspend the pipeline.
//
// The task never says where the answer goes: the WINDOW names its own slot via
// resultKey(), that key rides along on FrameResolved, and AbilityProcessor
// files the result there on resume.
// ---------------------------------------------------------------------------

export class ChoosePlayerTask implements ITask {
  constructor(private readonly filter: PlayerFilter = {}) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const options = filterPlayers(gs, ctx, this.filter)

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.PlayerChoice, ctx.ownerId, {
      options,
    })

    // Always suspend, even on an empty option set: that window settles on a
    // 0ms timer rather than inline, so the frame is still live here and the
    // empty result reaches the context through the ordinary resume path.
    return frameId
  }
}

export class ChooseCardTask implements ITask {
  constructor(private readonly filter: CardFilter) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const options = filterCards(gs, ctx, this.filter)

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.CardChoice, ctx.ownerId, {
      options,
    })

    // Always suspend, even on an empty option set: that window settles on a
    // 0ms timer rather than inline, so the frame is still live here and the
    // empty result reaches the context through the ordinary resume path.
    return frameId
  }
}

// ---------------------------------------------------------------------------
// ConfirmTask — "do you want to do X?" asked before the step that does X.
//
// It NAMES its question. `confirms` says which follow-up is being offered and
// `subjectKey` points at the context slot holding what it would be done to, so
// the window's payload carries both and a client can render "Roll on Victim?"
// from data instead of guessing from window type alone. One window type with a
// described question, not a window class per confirmable task — the same call
// made when the per-window Opened/Closed events collapsed into one pair (§4).
//
// It also SKIPS ITSELF when that subject is empty: there is no sense asking
// whether to roll on a hero that was never stolen. Skipping its own body is a
// task's business; silencing the steps after it is not — those read the same
// empty subject and skip in turn.
//
// It is TERMINAL. CONFIRM emits TaskConfirmed and a separate registry entry
// triggers on it; DISMISS emits nothing, so the continuation never runs. The
// answer therefore gates exactly what the declaration puts in that entry —
// which is how "skip just this" stops being indistinguishable from "cancel
// everything after", the one thing wholesale rollback could not express.
// ---------------------------------------------------------------------------

export type ConfirmSpec = {
  /** The follow-up being offered, e.g. 'RollOnHero'. A continuation entry
   *  matches on it with `when: { confirms }`, and the client renders it. */
  confirms: string
  /**
   * Context slot holding the subject. Absent means the prompt has no subject
   * and is always asked; present-but-empty means there is nothing to ask about
   * and the task skips itself.
   *
   * It is also the handoff: the continuation runs with a FRESH context (§2 —
   * nested runs do not inherit), so this slot rides on the TaskConfirmed event
   * and is seeded back in. Carry exactly what the confirm names, never the
   * whole blackboard.
   */
  subjectKey?: string
}

export class ConfirmTask implements ITask {
  constructor(private readonly spec: ConfirmSpec) {}

  execute(
    _gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const subject = this.spec.subjectKey
      ? (ctx.get<unknown[]>(this.spec.subjectKey) ?? [])
      : undefined

    // Nothing to ask about — skip the prompt rather than opening a window
    // about a subject that does not exist. Skipping its own body is this
    // task's business; the continuation simply never triggers.
    if (subject && subject.length === 0) return

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.TaskChoice, ctx.ownerId, {
      confirms: this.spec.confirms,
      // Routes the answer back to the card that asked, via TriggerScope.SelfCard.
      sourceCardId: ctx.sourceCardId,
      ...(this.spec.subjectKey &&
        subject && {
          cardId: subject[0],
          ctxSeed: { [this.spec.subjectKey]: subject },
        }),
    })
    return frameId
  }
}
