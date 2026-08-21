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
  CTX_DRAWN_CARD_IDS,
  CTX_PULLED_CARD_IDS,
} from '../abilities/ability-context'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// DrawTask — draw N cards from the main deck into the owner's hand
// ---------------------------------------------------------------------------

export class DrawTask implements ITask {
  constructor(private count: number) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const player = gs.getPlayer(ctx.ownerId)
    if (!player) return

    const drawn: string[] = []
    for (let i = 0; i < this.count; i++) {
      const cardId = gs.getMainDeck().draw()
      if (!cardId) break
      player.addToHand(cardId)
      drawn.push(cardId)
      em.emit(GameEventFactory.cardDrawn(ctx.ownerId, cardId))
    }
    // Set even when the deck ran dry: readers tell "drew nothing" from "never
    // drew" (see CardTypeCondition, RollOnHeroTask).
    ctx.set(CTX_DRAWN_CARD_IDS, drawn)
  }
}

// ---------------------------------------------------------------------------
// DiscardTask — move a card from the owner's hand to the discard pile
// ---------------------------------------------------------------------------

export class DiscardTask implements ITask {
  /**
   * Card to discard. Defaults to the card a ChooseCardTask put on the context.
   */
  constructor(private readonly fromKey: string = CTX_CHOSEN_CARD) {}

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

    // Empty = the player was asked and picked nothing. Nothing to discard.
    const [cardId] = cards
    if (!cardId) return

    const player = gs.getPlayer(ctx.ownerId)
    if (!player) return
    if (!player.getHand().includes(cardId)) return

    player.removeFromHand(cardId)
    gs.getDiscardPile().add(cardId)
    em.emit(GameEventFactory.cardDiscarded(ctx.ownerId, cardId))
  }
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

    const from = gs.getPlayer(fromPlayerId)
    const to = gs.getPlayer(ctx.ownerId)
    if (!from || !to) return

    const hand = from.getHand()
    if (hand.length === 0) return

    const cardId = hand[Math.floor(Math.random() * hand.length)]
    from.removeFromHand(cardId)
    to.addToHand(cardId)
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
