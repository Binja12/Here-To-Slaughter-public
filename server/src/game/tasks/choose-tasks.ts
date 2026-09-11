import { IGameEventEmitter, ReactionWindowType, Zone } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import {
  chosenPlayers,
  chosenCardOf,
  AbilityContext,
  CTX_ASKED_SEATS,
  CTX_CHOSEN_CARD,
} from '../abilities/ability-context'
import {
  CardFilter,
  PlayerFilter,
  cardsOf,
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
  constructor(
    private readonly filter: PlayerFilter = {},
    /** What is being asked, for the screen — see `question` on ChooseCardTask. */
    private readonly question?: string,
  ) {}

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
      sourceCardId: ctx.sourceCardId,
      ...(this.question && { question: this.question }),
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
  /**
   * What is being asked, for the screen (`detail.question`) — the board puts
   * it up in large type over the choice, so it is what tells the player WHY
   * they are picking: "Choose a hero to sacrifice", not "Choose a card".
   * Write it as an instruction, sentence case, no trailing full stop. Only a
   * choice whose own cards say the whole thing may leave it out; the screen
   * then falls back to the window type.
   */
  question?: string
}

export class ChooseCardTask implements ITask {
  private readonly requiresKey?: string
  private readonly resultKey: string
  private readonly question?: string

  /** A bare string is the `requiresKey`. */
  constructor(
    private readonly filter: CardFilter,
    options: string | ChooseCardOptions = {},
  ) {
    const opts = typeof options === 'string' ? { requiresKey: options } : options
    this.requiresKey = opts.requiresKey
    this.resultKey = opts.resultKey ?? CTX_CHOSEN_CARD
    this.question = opts.question
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
    // The card asking rides in the detail, so a screen can show it big while
    // the board is dimmed for its question.
    rm.openWindow(frameId, ReactionWindowType.CardChoice, respondentId, {
      options,
      resultKey: this.resultKey,
      sourceCardId: ctx.sourceCardId,
      ...(this.question && { question: this.question }),
    })

    // Suspends even on an empty option set: ChoiceWindow settles that on a
    // 0ms timer, so the frame is still live here.
    return frameId
  }
}

// ---------------------------------------------------------------------------
// ChooseCardEachTask — the same question to several seats, all at once
//
// "Every opponent discards one card" is one question per seat, over that
// seat's own cards, and nobody waits for anybody: ONE frame, one CardChoice
// window per seat, each filed under chosenCardOf(seat). The frame settles
// when the last window does (ChoiceWindow.resolve) and the pipeline wakes
// once, every pick written. CTX_ASKED_SEATS says who was asked, in seat
// order, for the step that acts on the picks (DiscardEachTask).
//
// Not a ForEachPlayerTask: that starts a run per seat, one after another, each
// with a context of its own that never reaches the parent. This keeps the
// whole thing in one context, and the table answers together.
// ---------------------------------------------------------------------------

export class ChooseCardEachTask implements ITask {
  constructor(
    /** Which seats are asked. Defaults to the other players. */
    private readonly seats: PlayerFilter,
    /** What each seat picks from — its OWN cards in the zone; owner is the seat. */
    private readonly filter: Omit<CardFilter, 'owner' | 'executor'>,
    /** What is being asked, for the screen — see `question` on ChooseCardTask. */
    private readonly question?: string,
  ) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const seatIds = filterPlayers(gs, ctx, this.seats)
    ctx.set(CTX_ASKED_SEATS, seatIds)

    // Nobody to ask: no frame, or nothing would ever wake the pipeline.
    if (seatIds.length === 0) return

    const frameId = rm.openFrame()
    for (const seatId of seatIds) {
      rm.openWindow(frameId, ReactionWindowType.CardChoice, seatId, {
        options: cardsOf(gs, ctx, this.filter, seatId),
        resultKey: chosenCardOf(seatId),
        sourceCardId: ctx.sourceCardId,
        ...(this.question && { question: this.question }),
      })
    }
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
  constructor(
    /** What is being asked, for the screen — see `question` on ChooseCardTask. */
    private readonly question?: string,
  ) {}

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
      sourceCardId: ctx.sourceCardId,
      ...(this.question && { question: this.question }),
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
  constructor(
    /** Values to offer — an ability's own numbers, the Protecting Horn's `[1, -1]`. */
    private readonly values: number[],
    /** What is being asked, for the screen — see `question` on ChooseCardTask. */
    private readonly question?: string,
  ) {}

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
    // The card asking — the Protecting Horn — rides in the detail so a screen
    // can put the pick on that card rather than in a generic box.
    rm.openWindow(frameId, ReactionWindowType.ValueChoice, ctx.ownerId, {
      options,
      bias,
      sourceCardId: ctx.sourceCardId,
      ...(this.question && { question: this.question }),
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
   * What is being asked, in words, for the screen. Without it the board
   * humanises `confirms`, which reads like an engine label ("play an item?").
   */
  question?: string
  /**
   * Slot holding the subject: names it for the client, skips the prompt when
   * empty, and rides to the continuation as ctxSeed.
   */
  subjectKey?: string
  /**
   * Who is asked. The ability owner unless `'chosen'`: "that opponent may then
   * draw one card" is the chosen seat's yes or no (Plundering Puma).
   */
  executor?: Executor
}

// ---------------------------------------------------------------------------
// ChooseActionTask — "which of these do you do?", via TaskChoiceWindow.
//
// ConfirmTask with N labels: the pick announces TaskConfirmed with the label
// picked, and a separate entry per label continues on it (`when`). The LAST
// label is what silence DOES — a timeout picks it and announces it — so a
// "you may X instead of Y" puts the printed Y last. Must be the last step of
// its entry, like a confirm.
//
// `asCard` announces the question as ANOTHER card's, so that card's entries
// continue it: a replacement effect asks on behalf of the card that
// installed it (Corrupted Sabretooth, from inside DestroyTask).
// ---------------------------------------------------------------------------

export type ActionChoiceSpec = {
  /** The labels offered, in order. The last is what silence does. */
  actions: string[]
  /** For the client: what is being asked, in words. */
  question?: string
  /** Slot holding the subject; names it for the client and rides to the continuation. */
  subjectKey?: string
  /** Who is asked. The ability owner unless `'chosen'`. */
  executor?: Executor
  /** Announce as this card's question instead of the context's source card. */
  asCard?: string
}

export class ChooseActionTask implements ITask {
  constructor(private readonly spec: ActionChoiceSpec) {
    if (spec.actions.length < 2) {
      throw new Error('ChooseActionTask: a choice of action needs at least two labels.')
    }
  }

  execute(
    _gs: GameState,
    ctx: AbilityContext,
    _em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const subject = this.spec.subjectKey
      ? (ctx.get<unknown[]>(this.spec.subjectKey) ?? [])
      : undefined
    if (subject && subject.length === 0) return

    const respondentId =
      this.spec.executor === 'chosen' ? chosenPlayers(ctx)[0] : ctx.ownerId
    if (!respondentId) return

    const ctxSeed = {
      ...(this.spec.subjectKey && subject && { [this.spec.subjectKey]: subject }),
      ...carriedSeat(ctx),
    }

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.TaskChoice, respondentId, {
      actions: this.spec.actions,
      silent: this.spec.actions[this.spec.actions.length - 1],
      ...(this.spec.question && { question: this.spec.question }),
      sourceCardId: this.spec.asCard ?? ctx.sourceCardId,
      ...(this.spec.subjectKey && subject && { cardId: subject[0] }),
      ...(Object.keys(ctxSeed).length && { ctxSeed }),
    })
    return frameId
  }
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
    // is one, so "that opponent may then draw" still knows who "that opponent"
    // is.
    const ctxSeed = {
      ...(this.spec.subjectKey && subject && { [this.spec.subjectKey]: subject }),
      ...carriedSeat(ctx),
    }

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.TaskChoice, respondentId, {
      confirms: this.spec.confirms,
      ...(this.spec.question && { question: this.spec.question }),
      // Routes the answer back via TriggerScope.SelfCard.
      sourceCardId: ctx.sourceCardId,
      ...(this.spec.subjectKey && subject && { cardId: subject[0] }),
      ...(Object.keys(ctxSeed).length && { ctxSeed }),
    })
    return frameId
  }
}
