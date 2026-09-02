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
 * "...until this item comes off." ONE event, because taking gear off a hero has
 * one door: `Party.unequipItem` announces it, and `Party.removeHero` announces
 * it for a carrier leaving play. Nothing drops equipment silently any more.
 *
 * Named for what ENDS it rather than for the state it holds under, like every
 * other lifetime here. The old name said "while equipped", which read as a
 * standing condition and hid the fact that a steal — remove then add — passes
 * through the ending event on its way to re-installing.
 *
 * The check reads the EVENT's item id rather than asking the board whether the
 * item is still worn anywhere: during a steal it is momentarily on nobody and
 * about to be on somebody, and only the event says which item just came off.
 */
export const untilUnequipped: EffectExpiry = {
  on: GameEventType.ItemUnequipped,
  shouldExpire: (_gs, effect, event) =>
    (event.getPayload() as { cardId?: string })?.cardId === effect.sourceCardId,
}

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
