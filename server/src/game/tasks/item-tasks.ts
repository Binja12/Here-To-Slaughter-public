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

    player.removeFromHand(itemId)
    em.emit(GameEventFactory.cardRemovedFromHand(playerId, itemId))

    const frameId = rm.openFrame()

    gs.getParty(heroOwnerId).equipItem(heroId, itemId)
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
   * A CURSED item is played at somebody — any hero on the table is a legal
   * target; a plain one only ever helps its own side. Either way the hero must
   * be empty-handed: one item per hero, and a second does not replace the
   * first.
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
    if (gs.getEquippedItem(heroId)) {
      return refused(RefusalReason.HeroAlreadyEquipped)
    }

    // A cursed item is played AT somebody; a plain one only dresses your own.
    if (!item.isCursed() && heroOwnerId !== playerId) {
      return refused(RefusalReason.NotYourHero)
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
