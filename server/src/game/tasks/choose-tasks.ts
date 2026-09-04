import { IGameEventEmitter, ReactionWindowType, Zone } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { chosenPlayers, AbilityContext, CTX_CHOSEN_CARD } from '../abilities/ability-context'
import {
  CardFilter,
  PlayerFilter,
  filterCards,
  filterPlayers,
} from '../reactions/choice-filters'
import { CTX_MODIFIER_TARGET } from '../abilities/ability-context'
import { Executor } from './tasks'
import { carriedSeat } from './conditions'

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

export type ChooseCardOptions = {
  /**
   * A slot that must hold something before this choice is worth asking.
   *
   * Not a filter — the question is whether the choice has a POINT, not which
   * cards qualify. Forced Exchange asks "which of yours do you hand over?"
   * only once there is somebody to hand it to; without this the player is
   * prompted and the step behind then skips on the same empty slot, which
   * reads as a bug from the table.
   *
   * Absent slot = mis-declared, empty slot = a step ahead produced nothing.
   */
  requiresKey?: string
  /**
   * Where the pick lands: CTX_CHOSEN_CARD unless a second pick has to
   * survive the first. Hook keeps its item in CTX_CHOSEN_ITEM while the hero
   * pick takes the default; PlayItemTask then reads both.
   */
  resultKey?: string
}

export class ChooseCardTask implements ITask {
  private readonly requiresKey?: string
  private readonly resultKey: string

  /** A bare string is the `requiresKey`. */
  constructor(
    private readonly filter: CardFilter,
    options: string | ChooseCardOptions = {},
  ) {
    const opts = typeof options === 'string' ? { requiresKey: options } : options
    this.requiresKey = opts.requiresKey
    this.resultKey = opts.resultKey ?? CTX_CHOSEN_CARD
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    if (this.requiresKey) {
      const required = ctx.get<unknown[]>(this.requiresKey)
      if (required === undefined) {
        throw new Error(
          `ChooseCardTask: nothing has written ${this.requiresKey} — the ` +
            'ability named it as a precondition but no step ahead fills it.',
        )
      }
      // Asked nothing, picked nothing — said in the slot, or the step behind
      // would read the PREVIOUS pick (Qi Bear's later rounds).
      if (required.length === 0) return void ctx.set(this.resultKey, [])
    }

    const options = filterCards(gs, ctx, this.filter)

    // The victim answers a victim's choice; with no seat in the slot there is
    // nobody to ask, and the step behind skips on the empty result.
    const respondentId =
      this.filter.executor === 'chosen' ? chosenPlayers(ctx)[0] : ctx.ownerId
    if (!respondentId) return void ctx.set(this.resultKey, [])

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.CardChoice, respondentId, {
      options,
      resultKey: this.resultKey,
    })

    // Suspends even on an empty option set: ChoiceWindow settles that on a
    // 0ms timer, so the frame is still live here.
    return frameId
  }
}

/**
 * ChooseMonsterTask — pick one monster out of the face-up row.
 *
 * Not a ChooseCardTask with a monster filter, for one reason: the window it
 * opens has to be the one that knows the party requirement, so it can refuse a
 * pick that has gone stale (MonsterChoiceWindow.canSubmit). The FILTER is
 * ordinary though — Zone.MonsterPile with partyReqMet, both plain data.
 *
 * Only monsters the owner's party may legally attack are offered. With none,
 * the window settles on a 0ms timer with no pick and the steps behind it skip
 * on the empty slot — "the task just ends" needs no branch here.
 */
export class ChooseMonsterTask implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const options = filterCards(gs, ctx, {
      zone: Zone.MonsterPile,
      partyReqMet: true,
    })

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.MonsterChoice, ctx.ownerId, {
      options,
    })

    return frameId
  }
}

/**
 * ChooseValueTask — pick one of a printed list of numbers.
 *
 * With no argument it offers its OWN card's printed values, which is what a
 * modifier card wants: one declaration serves all 25 copies, whatever numbers
 * each is printed with. A card that grants a bonus it did not print — the
 * Protecting Horn's "+1 or -1" — passes its own list instead.
 */
export class ChooseValueTask implements ITask {
  /** Values to offer — an ability's own numbers, the Protecting Horn's `[1, -1]`. */
  constructor(private readonly values: number[]) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const options = this.values

    // Which way silence falls is the window-being-modified's rule, not this
    // step's and not the choice window's: only the roll knows whose it is.
    // Read here because this is the last point that can see both.
    const [targetPlayerId] = ctx.get<string[]>(CTX_MODIFIER_TARGET) ?? []
    const bias = gs.valueBiasFor(ctx.ownerId, targetPlayerId ?? ctx.ownerId)

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.ValueChoice, ctx.ownerId, {
      options,
      bias,
    })

    // Suspends even on an empty list, for the reason ChooseCardTask does.
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
  /**
   * Who is asked. The ability owner unless `'chosen'`: "that player MAY draw a
   * card" is the chosen seat's yes or no (Plundering Puma).
   */
  executor?: Executor
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

    const respondentId =
      this.spec.executor === 'chosen' ? chosenPlayers(ctx)[0] : ctx.ownerId
    if (!respondentId) return

    // What the continuation needs: the subject, and the chosen seat when there
    // is one, so "that player may draw" still knows who "that player" is.
    const ctxSeed = {
      ...(this.spec.subjectKey && subject && { [this.spec.subjectKey]: subject }),
      ...carriedSeat(ctx),
    }

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.TaskChoice, respondentId, {
      confirms: this.spec.confirms,
      // Routes the answer back via TriggerScope.SelfCard.
      sourceCardId: ctx.sourceCardId,
      ...(this.spec.subjectKey && subject && { cardId: subject[0] }),
      ...(Object.keys(ctxSeed).length && { ctxSeed }),
    })
    return frameId
  }
}
