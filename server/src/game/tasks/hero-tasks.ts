import {
  IGameEventEmitter,
  PassiveType,
  ReactionWindowType,
} from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../game-state'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_STOLEN_HERO_ID,
} from '../ability-context'
import { GameEventFactory } from '../events/game-event-factory'
import { HeroCard } from '../cards/hero-card'

// ---------------------------------------------------------------------------
// Hero tasks — steps that act on a hero in a party.
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

    party.removeHero(targetId, em, 'Destroyed')
    gs.getDiscardPile().add(targetId)
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
    fromParty.removeHero(heroId, em, 'Stolen')
    gs.getParty(ctx.ownerId).addHero(heroId, em, 'Stolen')
    // Recorded so later steps can still reach this hero after a second card
    // choice has overwritten CTX_CHOSEN_CARD.
    ctx.set(CTX_STOLEN_HERO_ID, [heroId])
    em.emit(GameEventFactory.heroStolen(ctx.ownerId, fromPlayerId, heroId))
  }
}

// ---------------------------------------------------------------------------
// RollOnHeroTask — roll on a hero and open a modifier window; the pipeline
// suspends here. ModifierWindow owns settlement and emits RollSuccess.
//
// Its snapshot is taken HERE, so a failed roll undoes nothing before it.
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
  ): string | void {
    const chosen = ctx.get<string[]>(this.fromKey)

    // Absent = no step ahead was declared to supply a hero.
    if (chosen === undefined) {
      throw new Error(
        `RollOnHeroTask: nothing has written ${this.fromKey} — expected a ` +
          'preceding step to supply a hero.',
      )
    }

    const [heroId] = chosen
    if (!heroId) return

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
    return frameId
  }
}
