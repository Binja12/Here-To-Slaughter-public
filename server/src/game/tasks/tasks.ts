import { CardType, IGameEventEmitter, PassiveType, RollContext } from 'shared'
import {
  IEffect,
  EffectExpiry,
  IReactionManager,
  ITask,
} from '../interfaces'
import { GameState } from '../pipelines/game-state'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_PLAYER,
  CTX_PULLED_CARD_IDS,
  CTX_DISCARDED_CARDS,
  CTX_ASKED_SEATS,
  chosenCardOf,
  chosenPlayers,
} from '../abilities/ability-context'
import { GameEventFactory } from '../events/game-event-factory'
import { filterPlayers, PlayerFilter, filterCards, CardFilter } from '../reactions/choice-filters'

// ---------------------------------------------------------------------------
// DiscardTask — move a card from the owner's hand to the discard pile
// ---------------------------------------------------------------------------

export class DiscardTask implements ITask {
  private readonly fromKey: string
  private readonly executor: Executor

  /**
   * `fromKey`: the slot holding the card, the choice slot by default.
   * `executor`: who runs this step, and so whose hand — the ability owner, or
   * `'chosen'` for "that player must DISCARD", the seat a ChoosePlayerTask or a per-seat run put in
   * CTX_CHOSEN_PLAYER (the mirror of a choice's `respondent`).
   */
  constructor(options: string | { fromKey?: string; executor?: Executor } = {}) {
    const opts = typeof options === 'string' ? { fromKey: options } : options
    this.fromKey = opts.fromKey ?? CTX_CHOSEN_CARD
    this.executor = opts.executor ?? 'owner'
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const cards = ctx.get<string[]>(this.fromKey)

    // Absent = no step ahead was declared to supply a card.
    if (cards === undefined) {
      throw new Error(
        `DiscardTask: nothing has written ${this.fromKey} — expected a ` +
          'preceding step to supply a card.',
      )
    }

    // Written on every run, so a step behind can tell "discarded nothing"
    // from "never discarded" (Qi Bear hangs a destroy on it).
    ctx.set(CTX_DISCARDED_CARDS, [])

    // Empty = the player was asked and picked nothing. Nothing to discard.
    const [cardId] = cards
    if (!cardId) return

    const executorId = executorOf(ctx, this.executor)
    if (!executorId) return
    if (!gs.getPlayer(executorId)?.getHand().includes(cardId)) return

    gs.discardFromHand(executorId, cardId, em)
    ctx.set(CTX_DISCARDED_CARDS, [cardId])
  }
}

// ---------------------------------------------------------------------------
// DiscardEachTask — every asked seat discards its own pick
//
// The step behind a ChooseCardEachTask over hands: walks CTX_ASKED_SEATS,
// discards each seat's pick from that seat's hand (a seat that picked nothing
// discards nothing) and writes the lot to CTX_DISCARDED_CARDS — "the
// discarded cards" a card like Beary Wise then chooses among.
// ---------------------------------------------------------------------------

export class DiscardEachTask implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const seats = ctx.get<string[]>(CTX_ASKED_SEATS)
    if (seats === undefined) {
      throw new Error(
        'DiscardEachTask: nothing has written the asked seats — a ' +
          'ChooseCardEachTask belongs before this step.',
      )
    }
    const discarded: string[] = []
    for (const seatId of seats) {
      const [cardId] = ctx.get<string[]>(chosenCardOf(seatId)) ?? []
      if (!cardId || !gs.getPlayer(seatId)?.getHand().includes(cardId)) continue
      gs.discardFromHand(seatId, cardId, em)
      discarded.push(cardId)
    }
    ctx.set(CTX_DISCARDED_CARDS, discarded)
  }
}

// ---------------------------------------------------------------------------
// TradeHandsTask — swap the owner's whole hand with the chosen seat's
//
// Dodgy Dealer. Card by card through the hand doors, announced ONCE as
// HandsTraded rather than as a pull per card: nothing was taken from anybody,
// and a per-card announcement would wake every "when you pull" reaction.
// Empty hands trade too — the printed text has no "if".
// ---------------------------------------------------------------------------

export class TradeHandsTask implements ITask {
  /** Slot naming the other seat. Defaults to a ChoosePlayerTask's. */
  constructor(private readonly fromKey: string = CTX_CHOSEN_PLAYER) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const chosen = ctx.get<string[]>(this.fromKey)
    if (chosen === undefined) {
      throw new Error(
        `TradeHandsTask: nothing has written ${this.fromKey} — the ability is ` +
          'missing a ChoosePlayerTask before this step.',
      )
    }
    const [otherId] = chosen
    if (!otherId || otherId === ctx.ownerId) return
    const mine = gs.getPlayer(ctx.ownerId)
    const theirs = gs.getPlayer(otherId)
    if (!mine || !theirs) return

    const myHand = [...mine.getHand()]
    const theirHand = [...theirs.getHand()]
    for (const cardId of myHand) {
      gs.removeFromHand(ctx.ownerId, cardId)
      gs.addToHand(otherId, cardId)
    }
    for (const cardId of theirHand) {
      gs.removeFromHand(otherId, cardId)
      gs.addToHand(ctx.ownerId, cardId)
    }
    em.emit(GameEventFactory.handsTraded(ctx.ownerId, otherId))
  }
}

/** Who a step runs AS: the ability owner, or the chosen seat — the target of a "that player must …". */
export type Executor = 'owner' | 'chosen'

/**
 * The player a step runs as. `'chosen'` reads CTX_CHOSEN_PLAYER — the
 * seat a ChoosePlayerTask answered with, or the one a per-seat run was
 * started for. An empty slot = nobody to act on, and the step skips.
 */
export function executorOf(ctx: AbilityContext, executor: Executor): string | undefined {
  return executor === 'chosen' ? chosenPlayers(ctx)[0] : ctx.ownerId
}

// ---------------------------------------------------------------------------
// PullCardTask — take a card out of another player's hand, sight unseen
//
// RANDOM, not chosen: "pull a card" is what you do to a hand you cannot see,
// and Fury Knuckle's "if it is a Challenge card" only means anything if the
// puller had no say. That is why this is a task and not a ChooseCardTask over
// Zone.Hand / Owner.Chosen — the card choice belongs to nobody.
// ---------------------------------------------------------------------------

export class PullCardTask implements ITask {
  /** Slot naming whose hand to reach into. Defaults to a ChoosePlayerTask's. */
  constructor(private readonly fromKey: string = CTX_CHOSEN_PLAYER) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const chosen = ctx.get<string[]>(this.fromKey)

    // Absent = no step ahead was declared to supply a player.
    if (chosen === undefined) {
      throw new Error(
        `PullCardTask: nothing has written ${this.fromKey} — the ability is ` +
          'missing a ChoosePlayerTask before this step.',
      )
    }

    // Declared up front, empty: every no-pull path leaves it that way, so a
    // later step can tell "pulled nothing" from "never pulled".
    ctx.set(CTX_PULLED_CARD_IDS, [])

    const [fromPlayerId] = chosen
    if (!fromPlayerId || fromPlayerId === ctx.ownerId) return

    if (!gs.getPlayer(fromPlayerId) || !gs.getPlayer(ctx.ownerId)) return

    const hand = gs.getPlayer(fromPlayerId)!.getHand()
    if (hand.length === 0) return

    const cardId = hand[Math.floor(Math.random() * hand.length)]
    gs.removeFromHand(fromPlayerId, cardId)
    gs.addToHand(ctx.ownerId, cardId)
    ctx.set(CTX_PULLED_CARD_IDS, [cardId])
    em.emit(GameEventFactory.cardPulled(ctx.ownerId, fromPlayerId, cardId))
  }
}

// ---------------------------------------------------------------------------
// ApplyEffectTask — install an ongoing effect
//
// The step that gives an ability a lifetime beyond its own run. The declaration
// supplies only the RULE (what the effect does and how long it lasts); identity
// — whose effect it is, which card installed it — is read from the context, so
// one shared task instance serves every card that copies the wording.
// ---------------------------------------------------------------------------

export type EffectSpec = {
  /** Which standing rule to install. */
  type: PassiveType
  /** Magnitude, for the rules that carry one. */
  value?: number
  /** Which kind of roll this applies to. Absent = every kind. */
  rollContext?: RollContext
  /** Which card types being PLAYED this applies to. Absent = every type. */
  cardTypes?: CardType[]
  /** Absent = permanent. One entry or several — first match ends the effect. */
  expiry?: EffectExpiry | EffectExpiry[]
  /**
   * Narrow the rule to the hero carrying the source card — for an item whose
   * wording is about "the equipped Hero". Resolved at install time, because a
   * declaration built at module load has no carrier yet.
   */
  scopedToCarrier?: boolean
}

export class ApplyEffectTask implements ITask {
  constructor(private readonly spec: EffectSpec) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const { expiry, scopedToCarrier, ...rule } = this.spec

    const effect: IEffect = {
      id: crypto.randomUUID(),
      sourceCardId: ctx.sourceCardId,
      ownerId: ctx.ownerId,
      ...rule,
      ...(scopedToCarrier && { cardId: gs.getItemCarrier(ctx.sourceCardId) }),
      // Normalised to an array so the sweep has one shape to walk.
      ...(expiry && { expiry: Array.isArray(expiry) ? expiry : [expiry] }),
    }

    gs.addEffect(effect)
    em.emit(
      GameEventFactory.effectApplied(ctx.ownerId, effect.id, ctx.sourceCardId, {
        passive: effect.type,
        // Event types only: shouldExpire is server code and has no business in
        // a payload a client may render.
        expiresOn: effect.expiry?.map((e) => e.on),
      }),
    )
  }
}

// ---------------------------------------------------------------------------
// ForEachPlayerTask — "each other player must …"
//
// An entry's steps run once, in one line, for the ability owner. A wording
// that acts on every seat in turn — each one discarding, sacrificing, handing
// a card over — needs the same steps once PER seat, each waiting for that
// seat's answer. The pipeline has no loop, and it does not need one: this
// task announces one PlayerTargeted per seat that matches the filter, with
// the seat riding along as CTX_CHOSEN_PLAYER, and the entry that continues
// the card (`on: PlayerTargeted, when: label`) runs once per announcement
// with a fresh context — the same hand-off CardTypeCondition and ConfirmTask
// use for their continuations.
//
// Order: the runs an event starts go on TOP of the stack (§6), so they
// finish last-in first-out. Announcing the seats in reverse order makes them
// resolve in seat order — a detail for the table, never for the rules.
//
// Whatever follows this step in ITS entry runs after every per-seat run has
// finished, because the stack drains top-down: a card that acts on each seat
// and then does something with the whole result can put that something here.
// ---------------------------------------------------------------------------

export class ForEachPlayerTask implements ITask {
  constructor(
    /** Which seats. Defaults to the other players. */
    private readonly filter: PlayerFilter = {},
    /** Announced on each PlayerTargeted; the continuation matches it with `when`. */
    private readonly label: string,
  ) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const seats = filterPlayers(gs, ctx, this.filter)
    for (const playerId of [...seats].reverse()) {
      em.emit(
        GameEventFactory.playerTargeted(
          ctx.ownerId,
          ctx.sourceCardId,
          this.label,
          { [CTX_CHOSEN_PLAYER]: [playerId] },
        ),
      )
    }
  }
}

// ---------------------------------------------------------------------------
// RevealTask — show cards to a seat, or the table, without moving them
//
// A look is not a decision, so it is not a window: nothing is asked and the
// table is not held. The cards go onto the seat's \`revealedCards\` in its view
// (GameState.revealTo), CardsRevealed is announced, and a clock takes them off
// again (hideRevealed + RevealEnded, so the table sees the change). How they
// are shown, and whether at all, is the client's business.
//
// \`to: 'owner'\` shows the ability owner (Sharp Fox looks at a hand);
// \`to: 'all'\` shows every seat ("you may reveal it" — Pan Chucks, Rex Major).
// ---------------------------------------------------------------------------

/** How long a reveal stays on the view. */
export const REVEAL_MS = 5_000

export class RevealTask implements ITask {
  constructor(
    private readonly spec: {
      /** Cards in a slot … */
      fromKey?: string
      /** … or cards a filter finds (a chosen player's hand). */
      filter?: CardFilter
      to: 'owner' | 'all'
    },
  ) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const cardIds = this.spec.fromKey
      ? (ctx.get<string[]>(this.spec.fromKey) ?? [])
      : this.spec.filter
        ? filterCards(gs, ctx, this.spec.filter)
        : []
    if (cardIds.length === 0) return

    const seats =
      this.spec.to === 'all'
        ? gs.getPlayers().map((player) => player.getId())
        : [ctx.ownerId]
    for (const seat of seats) gs.revealTo(seat, cardIds)
    em.emit(GameEventFactory.cardsRevealed(ctx.ownerId, cardIds, this.spec.to === 'all'))

    setTimeout(() => {
      for (const seat of seats) gs.hideRevealed(seat, cardIds)
      em.emit(GameEventFactory.revealEnded(ctx.ownerId, cardIds))
    }, REVEAL_MS)
  }
}
