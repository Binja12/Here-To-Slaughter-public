import { IGameEventEmitter, PassiveType } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_PLAYER,
  CTX_STOLEN_HERO_ID,
} from '../abilities/ability-context'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// Hero tasks — steps that move a hero already on the table. The mechanics both
// pipelines share are in `play-hero-task.ts` and `roll-on-hero-task.ts`.
// ---------------------------------------------------------------------------

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
  /** Slot holding the hero to destroy. Defaults to the choice slot. */
  constructor(private readonly fromKey: string = CTX_CHOSEN_CARD) {}

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
        `DestroyTask: nothing has written ${this.fromKey} — expected a ` +
          'preceding step to supply a hero.',
      )
    }

    // Empty = the player was asked and picked nothing.
    const [heroId] = heroes
    if (!heroId) return

    const ownerId = gs.getCardOwner(heroId)
    if (!ownerId) return

    const party = gs.getParty(ownerId)
    if (!party.getHeroIds().includes(heroId)) return

    const carriedItemId = party.removeHero(heroId, em, 'Destroyed')
    gs.getDiscardPile().add(heroId)
    // The gear goes down with its carrier rather than vanishing from every zone.
    if (carriedItemId) gs.getDiscardPile().add(carriedItemId)
    em.emit(GameEventFactory.heroDestroyed(ownerId, heroId))
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

    const fromParty = gs.getParty(ctx.ownerId)
    if (!fromParty.getHeroIds().includes(heroId)) return

    const carriedItemId = fromParty.removeHero(heroId, em, 'Given')
    gs.getParty(toPlayerId).addHero(heroId, em, 'Given', carriedItemId)
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
  /** Slot holding the hero to give up. Defaults to the choice slot. */
  constructor(private readonly fromKey: string = CTX_CHOSEN_CARD) {}

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

    const party = gs.getParty(ctx.ownerId)
    if (!party.getHeroIds().includes(heroId)) return

    const carriedItemId = party.removeHero(heroId, em, 'Sacrificed')
    gs.getDiscardPile().add(heroId)
    // The gear goes down with its carrier rather than vanishing from every zone.
    if (carriedItemId) gs.getDiscardPile().add(carriedItemId)
    em.emit(GameEventFactory.heroSacrificed(ctx.ownerId, heroId))
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

    // Declared up front, empty: every no-steal path leaves it that way, and
    // later steps read the empty slot and skip themselves.
    ctx.set(CTX_STOLEN_HERO_ID, [])

    const [heroId] = chosen
    if (!heroId) return

    const fromPlayerId = gs.getCardOwner(heroId)
    if (!fromPlayerId || fromPlayerId === ctx.ownerId) return

    // Checked at the mutation, not when the choice window built its options:
    // the protection may have been installed in between.
    if (gs.hasEffect(PassiveType.CantBeStolen, fromPlayerId)) return

    const fromParty = gs.getParty(fromPlayerId)
    if (!fromParty.getHeroIds().includes(heroId)) return

    // Both halves announce themselves, so expiries keyed to either see it.
    // The hero brings its gear along.
    const carriedItemId = fromParty.removeHero(heroId, em, 'Stolen')
    gs.getParty(ctx.ownerId).addHero(heroId, em, 'Stolen', carriedItemId)
    // Recorded so later steps can still reach this hero after a second card
    // choice has overwritten CTX_CHOSEN_CARD.
    ctx.set(CTX_STOLEN_HERO_ID, [heroId])
    em.emit(GameEventFactory.heroStolen(ctx.ownerId, fromPlayerId, heroId))
  }
}
