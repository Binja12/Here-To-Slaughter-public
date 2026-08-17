import { GameEventType, HeroClass, IGameEvent, TriggerScope } from 'shared'
import type { AbilityTrigger, ActiveEffect, EffectExpiry } from './interfaces'
import type { GameState } from './game-state'
import { HeroCard } from './cards/hero-card'

// ---------------------------------------------------------------------------
// Effect lifetimes
//
// Trigger and expiry are symmetric: both are game events. An effect turns on
// when its installing ability runs, and off when one of its expiry events
// fires — optionally confirmed by `shouldExpire`, a state check that runs
// ONLY then. The event says when to look; the check says whether it is
// really over. No expiry at all means permanent.
//
// Evaluated by AbilityProcessor before any trigger matching, so on the event
// that ends an effect, the effect is already gone for anything that same
// event triggers — "until your next turn" means the turn starts clean.
//
// This lives with the processor and not TurnManager because expiry events are
// arbitrary (a steal, a hero removal, a turn boundary); the processor is the
// one place that already sees every event.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Trigger matching
//
// Replaces the processor's old passiveSources/activeSources scans. Those hard
// coded exactly two answers to "whose events count" — any player's (leaders,
// monsters, items) or this card's own (heroes) — and could not express a card
// that reacts to any player's roll. Scope makes the answer declarative.
// ---------------------------------------------------------------------------

/**
 * True when `trigger` should fire for this ability on this event.
 *
 * `source` is only the identity the scope resolves against — which card the
 * ability came from, and whose it is.
 */
export function triggerMatches(
  gs: GameState,
  source: { sourceCardId: string; ownerId: string },
  trigger: AbilityTrigger,
  event: IGameEvent,
): boolean {
  if (trigger.on !== event.getType()) return false

  switch (trigger.scope) {
    case TriggerScope.SelfCard:
      return (
        (event.getPayload() as { cardId?: string })?.cardId ===
        source.sourceCardId
      )

    case TriggerScope.OwnerEvent:
      return event.getPlayerId() === source.ownerId

    case TriggerScope.OwnerTurn:
      return gs.getCurrentPlayerId() === source.ownerId

    case TriggerScope.Anyone:
      return true
  }

  // Exhaustive: a new scope without a branch is a compile error here, rather
  // than an ability that silently never fires.
  const unhandled: never = trigger.scope
  throw new Error(`Unhandled trigger scope ${String(unhandled)}`)
}

/** True when one of `effect`'s expiry entries matches `event`. */
export function isEffectExpired(
  gs: GameState,
  effect: ActiveEffect,
  event: IGameEvent,
): boolean {
  if (!effect.expiry) return false // permanent

  for (const expiry of effect.expiry) {
    if (expiry.on !== event.getType()) continue
    if (!expiry.shouldExpire || expiry.shouldExpire(gs, effect, event)) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Expiries — every card wording lives here, one place to read them all.
//
// `shouldExpire` is omitted whenever the event alone settles it, and present
// whenever the event also fires in situations that are not this effect's:
// TurnStarted fires for every player, HeroRemovedFromParty for every hero.
// ---------------------------------------------------------------------------

/**
 * "...until the end of the turn" — the turn in progress, whoever is playing it.
 * No check: every TurnEnded ends that turn, so there is nothing to confirm.
 */
export const untilEndOfTurn: EffectExpiry = {
  on: GameEventType.TurnEnded,
}

/** "...until your next turn" — measured against the effect's OWNER. */
export const untilOwnersNextTurn: EffectExpiry = {
  on: GameEventType.TurnStarted,
  shouldExpire: (_gs, effect, event) =>
    (event.getPayload() as { playerId?: string })?.playerId === effect.ownerId,
}

/**
 * "...while the card that granted this is still in play" — for an effect whose
 * source can leave the party. Card ABILITIES need nothing like this: they are
 * read from the party each event, so they stop on their own.
 */
export const untilSourceLeavesParty: EffectExpiry = {
  on: GameEventType.HeroRemovedFromParty,
  shouldExpire: (_gs, effect, event) =>
    (event.getPayload() as { cardId?: string })?.cardId === effect.sourceCardId,
}

/**
 * "...while you have a <class> in your party."
 *
 * A factory rather than one constant per class: the wording is identical for
 * all six, only the class differs.
 *
 * The event says WHEN to look; the check says WHETHER it is really over —
 * losing one of two Rangers fires HeroRemovedFromParty but leaves the condition
 * true, so the effect survives. That case is why `shouldExpire` exists at all.
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
