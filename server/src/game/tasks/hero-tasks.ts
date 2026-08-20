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

    const carriedItemId = party.removeHero(targetId, em, 'Destroyed')
    gs.getDiscardPile().add(targetId)
    // The gear goes down with its carrier rather than vanishing from every zone.
    if (carriedItemId) gs.getDiscardPile().add(carriedItemId)
    em.emit(GameEventFactory.heroDestroyed(ctx.ownerId, targetId))
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
