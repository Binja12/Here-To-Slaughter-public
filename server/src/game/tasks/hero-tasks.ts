import { IGameEventEmitter, PassiveType } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
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
