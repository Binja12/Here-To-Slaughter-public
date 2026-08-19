import { GameEventType, HeroClass, IGameEvent, TriggerScope } from 'shared'
import type { AbilityTrigger, ActiveEffect, EffectExpiry } from './interfaces'
import type { GameState } from './game-state'
import { HeroCard } from './cards/hero-card'

// ---------------------------------------------------------------------------
// Trigger matching and effect lifetimes. Both are driven by game events, and
// both are evaluated by TaskManager — expiry before trigger matching, so
// an effect ending on an event is gone for anything that event fires.
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

  // Which variant, after scope answered whose. Absent = any event of the type.
  if (trigger.when !== undefined) {
    const { label } = (event.getPayload() ?? {}) as { label?: string }
    if (label !== trigger.when) return false
  }

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
// Expiries — every card wording, in one place. `shouldExpire` is present only
// when the event also fires for situations that are not this effect's.
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
