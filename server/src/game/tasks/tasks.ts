import {
  GameEventType,
  IGameEventEmitter,
  PassiveType,
  ReactionWindowType,
} from 'shared'
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
  CTX_LAST_DRAWN_CARD_ID,
  CTX_STOLEN_HERO_ID,
} from '../ability-context'
import { GameEventFactory } from '../events/game-event-factory'
import { HeroCard } from '../cards/hero-card'

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

    for (let i = 0; i < this.count; i++) {
      const cardId = gs.getMainDeck().draw()
      if (!cardId) break
      player.addToHand(cardId)
      ctx.set(CTX_LAST_DRAWN_CARD_ID, cardId)
      em.emit(GameEventFactory.cardDrawn(ctx.ownerId, cardId))
    }
  }
}

// ---------------------------------------------------------------------------
// DiscardTask — remove a card from the owner's hand to the discard pile
// ---------------------------------------------------------------------------

export class DiscardTask implements ITask {
  constructor(private readonly cardId?: string) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const targetId = this.cardId ?? ctx.sourceCardId
    const player = gs.getPlayer(ctx.ownerId)
    if (!player) return
    if (!player.getHand().includes(targetId)) return

    player.removeFromHand(targetId)
    gs.getDiscardPile().add(targetId)
    em.emit(GameEventFactory.cardDiscarded(ctx.ownerId, targetId))
  }
}

// ---------------------------------------------------------------------------
// DestroyTask — remove a hero from the owner's party to the discard pile
// ---------------------------------------------------------------------------

export class DestroyTask implements ITask {
  constructor(private readonly heroId?: string) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const targetId = this.heroId ?? ctx.sourceCardId
    const party = gs.getParty(ctx.ownerId)
    if (!party.getHeroIds().includes(targetId)) return

    party.removeHero(targetId, em, 'Destroyed')
    gs.getDiscardPile().add(targetId)
    em.emit(GameEventFactory.heroDestroyed(ctx.ownerId, targetId))
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

// ---------------------------------------------------------------------------
// StealFromPartyTask — move a hero from another player's party to the owner's party
// ---------------------------------------------------------------------------

export class StealFromPartyTask implements ITask {
  /**
   * Target hero. Defaults to the card a ChooseCardTask put on the context.
   */
  constructor(private readonly fromKey: string = CTX_CHOSEN_CARD) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const [heroId] = ctx.get<string[]>(this.fromKey) ?? []

    if (!heroId) {
      throw new Error(
        'StealFromPartyTask: no target hero — the ability is missing a ' +
          'ChooseCardTask before this step.',
      )
    }

    const fromPlayerId = gs.getCardOwner(heroId)
    if (!fromPlayerId || fromPlayerId === ctx.ownerId) return

    // A standing CantBeStolen effect on the target's owner beats the steal.
    // Checked here, at the mutation, rather than only when the choice window
    // built its options: the protection may have been installed in between.
    if (gs.hasEffect(PassiveType.CantBeStolen, fromPlayerId)) return

    const fromParty = gs.getParty(fromPlayerId)
    if (!fromParty.getHeroIds().includes(heroId)) return

    // Both halves announce themselves, so effect expiries keyed to a hero
    // leaving OR entering a party see the move. The hero's own ability needs no
    // help: it is read from whichever party holds the card, so it follows here.
    fromParty.removeHero(heroId, em, 'Stolen')
    gs.getParty(ctx.ownerId).addHero(heroId, em, 'Stolen')
    // Recorded so later steps can still reach this hero after a second card
    // choice has overwritten CTX_CHOSEN_CARD.
    ctx.set(CTX_STOLEN_HERO_ID, [heroId])
    em.emit(GameEventFactory.heroStolen(ctx.ownerId, fromPlayerId, heroId))
  }
}

// ---------------------------------------------------------------------------
// RollOnHeroTask — roll dice on a hero and open a modifier window.
//
// Emits DiceRolled then opens a modifier-window frame (which snapshots GS).
// The pipeline suspends here; if finalRoll >= rollReq ReactionManager emits
// RollSuccess and FrameResolved resumes remaining steps.
//
// The snapshot is taken HERE, so a failed roll only undoes what happens from
// this step onward — earlier steps in the same ability (a steal, a discard)
// have already been captured by it and survive the rollback.
// ---------------------------------------------------------------------------

export class RollOnHeroTask implements ITask {
  /**
   * Hero to roll on. Defaults to the card a ChooseCardTask put on the context.
   */
  constructor(private readonly fromKey: string = CTX_CHOSEN_CARD) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): void {
    const [heroId] = ctx.get<string[]>(this.fromKey) ?? []

    if (!heroId) {
      throw new Error(
        'RollOnHeroTask: no target hero — expected a preceding step to ' +
          'supply one.',
      )
    }

    const hero = gs.getCard(heroId)
    if (!(hero instanceof HeroCard)) return

    const rollReq = hero.getRollReq()
    const baseRoll = Math.ceil(Math.random() * 11) + 1

    em.emit(GameEventFactory.diceRolled(ctx.ownerId, heroId, baseRoll))

    // Mark ability used before the snapshot so rollback doesn't undo it —
    // the hero's ability slot is consumed whether the roll succeeds or fails.
    gs.markAbilityUsed(heroId)

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.Modifier, ctx.ownerId, {
      rollerId: ctx.ownerId,
      baseRoll,
      rollReq,
      heroId,
    })
  }
}

