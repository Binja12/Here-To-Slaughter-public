import { IGameEventEmitter, PassiveType } from 'shared'
import {
  AbilityTrigger,
  ActiveEffect,
  EffectExpiry,
  IReactionManager,
  ITask,
} from '../interfaces'
import { GameState } from '../game-state'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_DRAWN_CARD_IDS,
} from '../ability-context'
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
// ApplyEffectTask — install an ongoing effect
//
// The step that gives an ability a lifetime beyond its own run. The declaration
// supplies only the RULE (what the effect does and how long it lasts); identity
// — whose effect it is, which card installed it — is read from the context, so
// one shared task instance serves every card that copies the wording.
// ---------------------------------------------------------------------------

export type EffectSpec = {
  passive?: { type: PassiveType; value?: number }
  /** Same shape a card ability uses — installed, they are the same record. */
  trigger?: AbilityTrigger
  steps?: ITask[]
  /** Absent = permanent. One entry or several — first match ends the effect. */
  expiry?: EffectExpiry | EffectExpiry[]
}

export class ApplyEffectTask implements ITask {
  constructor(private readonly spec: EffectSpec) {
    const triggered = spec.trigger !== undefined
    if (triggered !== (spec.steps !== undefined)) {
      throw new Error(
        'ApplyEffectTask: `trigger` and `steps` go together — a trigger with ' +
          'no steps fires nothing, and steps with no trigger never run.',
      )
    }
    if (!spec.passive && !triggered) {
      throw new Error(
        'ApplyEffectTask: an effect needs a `passive` flag or a ' +
          '`trigger`+`steps` pair, otherwise it does nothing at all.',
      )
    }
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const { expiry, ...rule } = this.spec
    const effect: ActiveEffect = {
      id: crypto.randomUUID(),
      sourceCardId: ctx.sourceCardId,
      ownerId: ctx.ownerId,
      ...rule,
      // Normalised to an array so the sweep has one shape to walk.
      ...(expiry && { expiry: Array.isArray(expiry) ? expiry : [expiry] }),
    }

    gs.addEffect(effect)
    em.emit(
      GameEventFactory.effectApplied(ctx.ownerId, effect.id, ctx.sourceCardId, {
        passive: effect.passive?.type,
        // Event types only: shouldExpire is server code and has no business in
        // a payload a client may render.
        expiresOn: effect.expiry?.map((e) => e.on),
      }),
    )
  }
}
