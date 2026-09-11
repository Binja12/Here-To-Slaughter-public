import {
  IGameEventEmitter,
  ReactionWindowType,
  RefusalReason,
  RequestResult,
} from 'shared'
import { accepted, IReactionManager, ITask, refused } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext, CTX_CHOSEN_CARD } from '../abilities/ability-context'
import { HeroCard } from '../cards/hero-card'
import { ItemCard } from '../cards/item-card'
import { GameEventFactory } from '../events/game-event-factory'
import { forEachAskedSeat } from './tasks'

// ---------------------------------------------------------------------------
// Item tasks — steps that act on an item card.
//
// Same layout as magic-tasks.ts: the mechanic in an abstract base, with the
// IAction in `actions/` and the ITask here extending it (§1).
// ---------------------------------------------------------------------------

/**
 * Implements NEITHER IAction nor ITask, for the reason PlayMagic does not:
 * `execute(gs)` is a legal override of `execute(gs, ctx, em, rm)`, so one class
 * satisfying both would let TaskManager run an action.
 */
export abstract class PlayItem {
  /**
   * Hand → equipped to a hero → `ItemEquippedToHero` → challenge window.
   * Returns the frameId. Same shape as playMagic (§1).
   *
   * The card leaves the hand BEFORE the frame and the equip is written inside
   * it, so a lost challenge un-equips the item but does not hand it back;
   * ChallengeWindow discards it on that branch. Equipment is party state for
   * exactly this reason — `GameState.clone()` shares the card map, so gear
   * stored on the card would survive a rollback.
   *
   * `ItemEquippedToHero` announces the attempt. The item's own entry triggers
   * on the settled frame instead: a defeated item is no longer equipped, so it
   * is not among the sources that event is matched against.
   *
   * Throws on an occupied hero. Both wrappers ask `canEquip` first, so getting
   * here means the caller skipped the check — a mistake in the engine, not an
   * illegal request, and it fails at the point it was made.
   */
  protected playItem(
    gs: GameState,
    playerId: string,
    itemId: string,
    heroId: string,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const player = gs.getPlayer(playerId)
    if (!player) return

    // The party the gear lands in is the HERO's, which for a cursed item is
    // somebody else's.
    const heroOwnerId = gs.getCardOwner(heroId)
    if (!heroOwnerId) return

    const worn = gs.getEquippedItem(heroId)
    if (worn) {
      throw new Error(
        `playItem: ${heroId} already carries ${worn} — a hero holds one item ` +
          'and equipping does not replace it. canEquip refuses this.',
      )
    }

    gs.removeFromHand(playerId, itemId)
    em.emit(GameEventFactory.cardRemovedFromHand(playerId, itemId))

    const frameId = rm.openFrame()

    gs.equipItem(heroId, itemId)
    em.emit(GameEventFactory.itemEquipedToHero(playerId, itemId, heroId))

    // Last: this window suspends the drain.
    rm.openWindow(frameId, ReactionWindowType.Challenge, playerId, {
      cardId: itemId,
    })

    return frameId
  }

  /**
   * Whether this item may go on this hero.
   *
   * Ownership decides the side (the owner, 2026-09-08): a plain item helps its
   * own side and goes on a hero in the player's OWN party, a CURSED one is
   * played AT somebody and goes on an ENEMY hero. Either way the hero must be
   * empty-handed: one item per hero, and a second does not replace the first.
   *
   * Shared because the action checks it in `canExecute` and the task checks it
   * when it discovers its target.
   */
  protected canEquip(
    gs: GameState,
    playerId: string,
    itemId: string,
    heroId: string,
  ): RequestResult {
    const item = gs.getCard(itemId)
    if (!(item instanceof ItemCard)) return refused(RefusalReason.NotAnItem)
    if (!(gs.getCard(heroId) instanceof HeroCard)) {
      return refused(RefusalReason.NotAHero)
    }

    const heroOwnerId = gs.getCardOwner(heroId)
    if (!heroOwnerId) return refused(RefusalReason.HeroNotInParty)
    if (item.isCursed()) {
      if (heroOwnerId === playerId) return refused(RefusalReason.NotAnEnemyHero)
    } else if (heroOwnerId !== playerId) {
      return refused(RefusalReason.NotYourHero)
    }
    if (gs.getEquippedItem(heroId)) {
      return refused(RefusalReason.HeroAlreadyEquipped)
    }

    return accepted()
  }
}

/**
 * Same mechanic as PlayItemAction, no price — the ability already paid for
 * itself. Names WHAT it needs (a slot holding the item, a slot holding the
 * hero), never where either came from.
 */
export class PlayItemTask extends PlayItem implements ITask {
  constructor(
    /** Slot holding the item to play. */
    private readonly itemKey: string,
    /** Hero to equip it to. Defaults to what a ChooseCardTask picked. */
    private readonly heroKey: string = CTX_CHOSEN_CARD,
  ) {
    super()
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const [itemId] = this.read(ctx, this.itemKey)
    const [heroId] = this.read(ctx, this.heroKey)

    // Empty = the step ahead ran and produced nothing. A party with no heroes
    // makes an empty choice, and that travels here as an empty slot.
    if (!itemId || !heroId) return

    // Discovered at runtime, so the item may have left the hand since the slot
    // was written — the action's equivalent guard lives in canExecute.
    if (!gs.getPlayer(ctx.ownerId)?.getHand().includes(itemId)) return
    if (!this.canEquip(gs, ctx.ownerId, itemId, heroId).accepted) return

    // Returned, so the rest of the declaring card's entry waits on the same
    // challenge.
    return this.playItem(gs, ctx.ownerId, itemId, heroId, em, rm)
  }

  /** Absent = no step ahead was declared to fill this slot. */
  private read(ctx: AbilityContext, key: string): string[] {
    const value = ctx.get<string[]>(key)
    if (value === undefined) {
      throw new Error(
        `PlayItemTask: nothing has written ${key} — expected a preceding ` +
          'step to supply it.',
      )
    }
    return value
  }
}

// ---------------------------------------------------------------------------
// RetrieveCardTask — a card from the table back into a hand
//
// Where the card IS decides how it comes off, and the task finds out for
// itself rather than being told:
//   - the discard pile: "take an X of your choice from the discard pile into
//     your hand" (Lookie Rookie, Guiding Light, Radiant Horn, Bun Bun, Call to
//     the Fallen);
//   - a hero's gear: "return an equipped item to a hand" (Holy Curselifter,
//     Winds of Change) — the hero stays, the item comes off through
//     Party.unequipItem and announces ItemUnequipped, so an effect the item
//     granted expires the way `untilUnequipped` expects;
//   - another player's hand: "look through a hand and take any one card from
//     it" (Silent Shadow) — a CHOSEN card, which is the whole difference from
//     PullCardTask's blind draw, so it is announced as CardPulled all the same:
//     a card left one hand for another.
//
// Whose hand it lands in: the ability owner's, unless the declaration says
// `to: 'cardOwner'` — Winds of Change returns the item "to its owner's hand",
// the player whose hero wore it. A card that is nowhere the task knows of
// (already in the recipient's hand, in a party as a hero) is left alone.
// ---------------------------------------------------------------------------

export type RetrieveTo = 'owner' | 'cardOwner'

export class RetrieveCardTask implements ITask {
  constructor(
    /** Slot holding the card. Defaults to the choice slot. */
    private readonly fromKey: string = CTX_CHOSEN_CARD,
    /** Whose hand receives it. */
    private readonly to: RetrieveTo = 'owner',
  ) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const cards = ctx.get<string[]>(this.fromKey)
    if (cards === undefined) {
      throw new Error(
        `RetrieveCardTask: nothing has written ${this.fromKey} — expected a ` +
          'preceding step to supply a card.',
      )
    }
    const [cardId] = cards
    if (!cardId) return
    retrieve(gs, cardId, ctx.ownerId, this.to, em)
  }
}

/**
 * RetrieveEachTask — every asked seat's pick comes to the owner's hand.
 * The step behind a ChooseCardEachTask over hands (Greedy Cheeks: "every
 * opponent hands you one card"). Each move is announced as a pull, as
 * RetrieveCardTask announces a card that left a hand for another.
 */
export class RetrieveEachTask implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    forEachAskedSeat(ctx, (_seatId, cardId) => {
      retrieve(gs, cardId, ctx.ownerId, 'owner', em)
    })
  }
}

/**
 * The move itself, shared with ReturnAllItemsTask. Returns whether anything
 * moved.
 */
export function retrieve(
  gs: GameState,
  cardId: string,
  abilityOwnerId: string,
  to: RetrieveTo,
  em: IGameEventEmitter,
): boolean {
  // From the discard pile.
  if (gs.getDiscardPile().getAll().includes(cardId)) {
    if (!gs.getPlayer(abilityOwnerId)) return false
    gs.pickFromDiscardPile(cardId)
    gs.addToHand(abilityOwnerId, cardId)
    em.emit(GameEventFactory.cardRetrieved(abilityOwnerId, cardId, 'Discard'))
    return true
  }

  // Off a hero's gear.
  const carrierId = gs.getItemCarrier(cardId)
  if (carrierId) {
    const carrierOwnerId = gs.getCardOwner(carrierId)
    if (!carrierOwnerId) return false
    const recipientId = to === 'cardOwner' ? carrierOwnerId : abilityOwnerId
    if (!gs.getPlayer(recipientId)) return false
    gs.unequipItem(carrierId)
    em.emit(GameEventFactory.itemUnequipped(carrierOwnerId, cardId, carrierId))
    gs.addToHand(recipientId, cardId)
    em.emit(GameEventFactory.cardRetrieved(recipientId, cardId, 'Equipment'))
    return true
  }

  // Out of another player's hand — a chosen card, announced like a pull.
  const holderId = gs
    .getPlayers()
    .find((player) => player.getHand().includes(cardId))
    ?.getId()
  if (holderId && holderId !== abilityOwnerId) {
    if (!gs.getPlayer(abilityOwnerId)) return false
    gs.removeFromHand(holderId, cardId)
    gs.addToHand(abilityOwnerId, cardId)
    em.emit(GameEventFactory.cardPulled(abilityOwnerId, holderId, cardId))
    return true
  }

  return false
}

// ---------------------------------------------------------------------------
// ReturnAllItemsTask — every equipped item, back to its own player's hand
//
// Forceful Winds: no choice, no slot — the whole table's gear comes off at
// once, each item to the hand of the player whose hero wore it. One
// ItemUnequipped per item, so every granted effect expires as it would for a
// single return.
// ---------------------------------------------------------------------------

export class ReturnAllItemsTask implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const worn = gs
      .getPlayers()
      .flatMap((player) => gs.getParty(player.getId()).getHeroIds())
      .map((heroId) => gs.getEquippedItem(heroId))
      .filter((itemId): itemId is string => !!itemId)
    for (const itemId of worn) retrieve(gs, itemId, ctx.ownerId, 'cardOwner', em)
  }
}
