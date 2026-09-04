import { IGameEventEmitter, PassiveType } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_PLAYER,
  CTX_DESTROYED_HERO_ITEM,
  CTX_STOLEN_FROM_PLAYER,
  CTX_STOLEN_HERO_ID,
  CTX_WOULD_DESTROY,
} from '../abilities/ability-context'
import { GameEventFactory } from '../events/game-event-factory'
import { Executor, executorOf, forEachAskedSeat } from './tasks'
import { ChooseActionTask } from './choose-tasks'

/** Corrupted Sabretooth's two answers — its entries match them with `when`. */
export const STEAL_INSTEAD = 'Steal it instead'
export const DESTROY_ANYWAY = 'Destroy it'

// ---------------------------------------------------------------------------
// Hero tasks — steps that move a hero already on the table. The mechanics both
// pipelines share are in `play-hero-task.ts` and `roll-on-hero-task.ts`.
// ---------------------------------------------------------------------------

/**
 * Decoy Doll (item-066): "if the equipped Hero card would be sacrificed or
 * destroyed, move Decoy Doll to the discard pile instead." The doll's
 * TakesTheHit effect names its carrier; when the carrier is the hero about
 * to go, the doll comes off (ItemUnequipped — which also ends the effect) and
 * lands on the pile, and the hero stays. True when it took the hit.
 */
export function decoyTakesTheHit(
  gs: GameState,
  ownerId: string,
  heroId: string,
  em: IGameEventEmitter,
): boolean {
  const decoy = gs
    .getEffects(PassiveType.TakesTheHit, ownerId, heroId)
    .find((effect) => gs.getEquippedItem(heroId) === effect.sourceCardId)
  if (!decoy) return false
  gs.unequipItem(heroId)
  em.emit(GameEventFactory.itemUnequipped(ownerId, decoy.sourceCardId, heroId))
  gs.addToDiscardPile(decoy.sourceCardId)
  return true
}
// ---------------------------------------------------------------------------
// DestroyTask — remove a hero from ANY party to the discard pile
//
// The reach is the whole difference from SacrificeTask: destroy crosses the
// table, sacrifice does not. So the party is found from the HERO
// (`getCardOwner`), the way StealFromPartyTask finds the one it takes from,
// rather than assumed to be the ability owner's.
//
// `playerId` on the announcement is the party that LOST the hero, not the one
// that caused it — Dracos (monster-126) is printed "each time a Hero card in
// YOUR Party is destroyed", and that wording needs the loser to scope against.
// ---------------------------------------------------------------------------

export class DestroyTask implements ITask {
  private readonly fromKey: string
  private readonly replaceable: boolean

  /**
   * `fromKey`: the slot holding the hero to destroy, the choice slot by
   * default. `replaceable: false` skips the Sabretooth question — the
   * "destroy anyway" continuation of that very question, which would
   * otherwise ask again.
   */
  constructor(options: string | { fromKey?: string; replaceable?: boolean } = {}) {
    const opts = typeof options === 'string' ? { fromKey: options } : options
    this.fromKey = opts.fromKey ?? CTX_CHOSEN_CARD
    this.replaceable = opts.replaceable ?? true
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void {
    const heroes = ctx.get<string[]>(this.fromKey)

    // Absent = no step ahead was declared to supply a hero.
    if (heroes === undefined) {
      throw new Error(
        `DestroyTask: nothing has written ${this.fromKey} — expected a ` +
          'preceding step to supply a hero.',
      )
    }

    // Written on every run: Shurikitty retrieves whatever is named here, and
    // a destroy that never happened (or a bare hero) names nothing.
    ctx.set(CTX_DESTROYED_HERO_ITEM, [])

    // Empty = the player was asked and picked nothing.
    const [heroId] = heroes
    if (!heroId) return

    const ownerId = gs.getCardOwner(heroId)
    if (!ownerId) return

    if (!gs.getParty(ownerId).getHeroIds().includes(heroId)) return
    // Mighty Blade / Terratuga: the hero stays, silently — the pick was legal
    // and simply had no bite. Sacrifice is another reason and is not shielded.
    if (!gs.canBeDestroyed(heroId)) return
    // Decoy Doll: the doll takes the hit, the hero stays.
    if (decoyTakesTheHit(gs, ownerId, heroId, em)) return
    // Corrupted Sabretooth: "you MAY steal it instead" — the destroyer's
    // call, so the destroy hands over to a choice of action asked as the
    // Sabretooth's own question: its entries continue with the steal or with
    // the destroy (replaceable: false, or it would ask again). Their own hero
    // is destroyed as printed; there is nothing to steal from yourself.
    const [sabretooth] = gs.getEffects(PassiveType.StealsInsteadOfDestroy, ctx.ownerId)
    if (this.replaceable && sabretooth && ownerId !== ctx.ownerId) {
      ctx.set(CTX_WOULD_DESTROY, [heroId])
      return new ChooseActionTask({
        actions: [STEAL_INSTEAD, DESTROY_ANYWAY],
        question: 'Steal it instead of destroying it?',
        subjectKey: CTX_WOULD_DESTROY,
        asCard: sabretooth.sourceCardId,
      }).execute(gs, ctx, em, rm)
    }

    const carriedItemId = gs.removeHero(ownerId, heroId, em, 'Destroyed')
    gs.addToDiscardPile(heroId)
    // The gear goes down with its carrier rather than vanishing from every
    // zone — silently: it was not discarded by anyone, it fell.
    if (carriedItemId) {
      gs.addToDiscardPile(carriedItemId)
      ctx.set(CTX_DESTROYED_HERO_ITEM, [carriedItemId])
    }
    em.emit(GameEventFactory.heroDestroyed(ownerId, heroId))
  }
}

// ---------------------------------------------------------------------------
// SacrificeEachTask — every asked seat sacrifices its own pick
//
// The step behind a ChooseCardEachTask over parties (Spooky): each seat's
// pick, out of that seat's party, with everything a sacrifice honours
// (Decoy Doll takes the hit). A seat that picked nothing gives up nothing.
// ---------------------------------------------------------------------------

export class SacrificeEachTask implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    forEachAskedSeat(ctx, (seatId, heroId) => {
      if (!gs.getParty(seatId).getHeroIds().includes(heroId)) return
      if (decoyTakesTheHit(gs, seatId, heroId, em)) return
      const carriedItemId = gs.removeHero(seatId, heroId, em, 'Sacrificed')
      gs.addToDiscardPile(heroId)
      if (carriedItemId) gs.addToDiscardPile(carriedItemId)
      em.emit(GameEventFactory.heroSacrificed(seatId, heroId))
    })
  }
}

// ---------------------------------------------------------------------------
// GiveHeroTask — hand one of your own heroes to somebody else
//
// StealFromPartyTask pointed the other way: that one takes FROM a party the
// context named, this one gives FROM the ability owner's. Both are
// remove-then-add through Party's choke point, so both announce the canonical
// pair and both carry the hero's gear along — `removeHero` returns what it was
// wearing and `addHero` puts it back on in the new party, which is also what
// re-installs any effect the item granted (§7).
//
// A new REASON rather than a new event: that is the extension point party
// membership was built with, so nothing listening has to change.
// ---------------------------------------------------------------------------

export class GiveHeroTask implements ITask {
  constructor(
    /** Slot holding the hero to give away. Defaults to the choice slot. */
    private readonly heroKey: string = CTX_CHOSEN_CARD,
    /** Slot naming who receives it. Defaults to a ChoosePlayerTask's. */
    private readonly toKey: string = CTX_CHOSEN_PLAYER,
  ) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const heroes = this.read(ctx, this.heroKey)
    const recipients = this.read(ctx, this.toKey)

    // Empty = a step ahead ran and produced nothing.
    const [heroId] = heroes
    const [toPlayerId] = recipients
    if (!heroId || !toPlayerId) return

    // Giving to yourself is a no-op, not an error: a choice can land there.
    if (toPlayerId === ctx.ownerId) return
    if (!gs.getPlayer(toPlayerId)) return

    if (!gs.getParty(ctx.ownerId).getHeroIds().includes(heroId)) return

    const carriedItemId = gs.removeHero(ctx.ownerId, heroId, em, 'Given')
    gs.addHero(toPlayerId, heroId, em, 'Given', carriedItemId)
  }

  /** Absent = no step ahead was declared to fill this slot. */
  private read(ctx: AbilityContext, key: string): string[] {
    const value = ctx.get<string[]>(key)
    if (value === undefined) {
      throw new Error(
        `GiveHeroTask: nothing has written ${key} — expected a preceding ` +
          'step to supply it.',
      )
    }
    return value
  }
}

// ---------------------------------------------------------------------------
// SacrificeTask — the owner gives up one of their own heroes
//
// DestroyTask with a different reason and a different announcement, and they
// stay two tasks because the REASON is what a card wording keys off: a hero
// lost to a monster's fight-back was sacrificed, not destroyed by an opponent,
// and Party.removeHero makes every caller say which.
//
// Reads a slot rather than taking an id, because the hero is the player's own
// pick — a ChooseCardTask over Zone.Party runs ahead of it.
// ---------------------------------------------------------------------------

export class SacrificeTask implements ITask {
  private readonly fromKey: string
  private readonly executor: Executor

  /**
   * `fromKey`: the slot holding the hero to give up, the choice slot by
   * default. `executor`: who runs this step, and so whose party — the owner, or `'chosen'` for
   * "that player must SACRIFICE", the seat a ChoosePlayerTask or a per-seat
   * run put in CTX_CHOSEN_PLAYER (the mirror of a choice's `respondent`).
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
    const heroes = ctx.get<string[]>(this.fromKey)

    // Absent = no step ahead was declared to supply a hero.
    if (heroes === undefined) {
      throw new Error(
        `SacrificeTask: nothing has written ${this.fromKey} — expected a ` +
          'preceding step to supply a hero.',
      )
    }

    // Empty = the player was asked and picked nothing, or has no heroes at all.
    const [heroId] = heroes
    if (!heroId) return

    const executorId = executorOf(ctx, this.executor)
    if (!executorId) return
    if (!gs.getParty(executorId).getHeroIds().includes(heroId)) return
    // Decoy Doll: the doll takes the hit, the hero stays — on a sacrifice too.
    if (decoyTakesTheHit(gs, executorId, heroId, em)) return

    const carriedItemId = gs.removeHero(executorId, heroId, em, 'Sacrificed')
    gs.addToDiscardPile(heroId)
    // The gear goes down with its carrier rather than vanishing from every zone.
    if (carriedItemId) gs.addToDiscardPile(carriedItemId)
    em.emit(GameEventFactory.heroSacrificed(executorId, heroId))
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
    const chosen = ctx.get<string[]>(this.fromKey)

    // Absent = no ChooseCardTask ran ahead of this step: a mis-declared ability.
    if (chosen === undefined) {
      throw new Error(
        `StealFromPartyTask: nothing has written ${this.fromKey} — the ` +
          'ability is missing a ChooseCardTask before this step.',
      )
    }

    // Declared up front, empty: every no-steal path leaves them that way, and
    // later steps read the empty slot and skip themselves.
    ctx.set(CTX_STOLEN_HERO_ID, [])
    ctx.set(CTX_STOLEN_FROM_PLAYER, [])

    const [heroId] = chosen
    if (!heroId) return

    const fromPlayerId = gs.getCardOwner(heroId)
    if (!fromPlayerId || fromPlayerId === ctx.ownerId) return

    // Checked at the mutation, not when the choice window built its options:
    // the protection may have been installed in between.
    if (gs.hasEffect(PassiveType.CantBeStolen, fromPlayerId)) return

    if (!gs.getParty(fromPlayerId).getHeroIds().includes(heroId)) return

    // Both halves announce themselves, so expiries keyed to either see it.
    // The hero brings its gear along.
    const carriedItemId = gs.removeHero(fromPlayerId, heroId, em, 'Stolen')
    gs.addHero(ctx.ownerId, heroId, em, 'Stolen', carriedItemId)
    // Recorded so later steps can still reach this hero after a second card
    // choice has overwritten CTX_CHOSEN_CARD.
    ctx.set(CTX_STOLEN_HERO_ID, [heroId])
    ctx.set(CTX_STOLEN_FROM_PLAYER, [fromPlayerId])
    em.emit(GameEventFactory.heroStolen(ctx.ownerId, fromPlayerId, heroId))
  }
}
