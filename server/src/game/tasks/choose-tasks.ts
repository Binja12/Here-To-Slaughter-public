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
// resultKey(), that key rides along on FrameResolved, and TaskManager
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

    // Suspends even on an empty option set: ChoiceWindow settles that on a
    // 0ms timer, so the frame is still live here.
    return frameId
  }
}

// ---------------------------------------------------------------------------
// ConfirmTask — "do you want to do X?", via TaskChoiceWindow.
//
// Must be the LAST step of its entry: CONFIRM emits TaskConfirmed and a
// separate registry entry triggers on it, DISMISS emits nothing. Skips itself
// when `subjectKey` names an empty slot.
// ---------------------------------------------------------------------------

export type ConfirmSpec = {
  /** The follow-up offered. Becomes the event's `label`, matched by `when`. */
  confirms: string
  /**
   * Slot holding the subject: names it for the client, skips the prompt when
   * empty, and rides to the continuation as ctxSeed.
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

    // Nothing to ask about.
    if (subject && subject.length === 0) return

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.TaskChoice, ctx.ownerId, {
      confirms: this.spec.confirms,
      // Routes the answer back via TriggerScope.SelfCard.
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
