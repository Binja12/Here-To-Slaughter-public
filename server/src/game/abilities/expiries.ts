import { GameEventType, HeroClass } from 'shared'
import type { EffectExpiry } from '../interfaces'
import { HeroCard } from '../cards/hero-card'

// ---------------------------------------------------------------------------
// Every lifetime a card wording can be written in, in one place. Read by
// `ability-lifecycle.ts`.
//
// `shouldExpire` is present only when the event also fires for situations that
// are not this effect's.
// ---------------------------------------------------------------------------

/** "...until the end of the turn" — the turn in progress, whoever plays it. */
export const untilEndOfTurn: EffectExpiry = {
  on: GameEventType.TurnEnded,
}

/** "...until your next turn" — measured against the effect's OWNER. */
export const untilOwnersNextTurn: EffectExpiry = {
  on: GameEventType.TurnStarted,
  shouldExpire: (_gs, effect, event) =>
    (event.getPayload() as { playerId?: string })?.playerId === effect.ownerId,
}

/** "...while the card that granted this is still in play." */
export const untilSourceLeavesParty: EffectExpiry = {
  on: GameEventType.HeroRemovedFromParty,
  shouldExpire: (_gs, effect, event) =>
    (event.getPayload() as { cardId?: string })?.cardId === effect.sourceCardId,
}

/**
 * "...while the hero carrying the card that granted this is still in play."
 * The item's own ability ends with its carrier for free (it is derived from the
 * hero's position); an effect the item installed needs this.
 */
const noLongerWorn: EffectExpiry['shouldExpire'] = (gs, effect) =>
  !gs.getItemCarrier(effect.sourceCardId)

/**
 * "...while the item that granted this is still worn." Two ways that ends —
 * the carrier leaves play, or the item is replaced — and one question answers
 * both: is it still on anybody? Asked of the ITEM rather than the event's
 * subject, because both callers drop the gear before they announce.
 */
export const whileEquipped: EffectExpiry[] = [
  { on: GameEventType.HeroRemovedFromParty, shouldExpire: noLongerWorn },
  { on: GameEventType.ItemUnequipped, shouldExpire: noLongerWorn },
]

/**
 * "...while you have a <class> in your party." The check matters: losing one of
 * two Rangers fires HeroRemovedFromParty but leaves the condition true.
 */
export function whileClassInParty(heroClass: HeroClass): EffectExpiry {
  return {
    on: GameEventType.HeroRemovedFromParty,
    shouldExpire: (gs, effect) =>
      !gs
        .getParty(effect.ownerId)
        .getHeroIds()
        .some((heroId) => {
          const card = gs.getCard(heroId)
          return card instanceof HeroCard && card.getHeroClass() === heroClass
        }),
  }
}
