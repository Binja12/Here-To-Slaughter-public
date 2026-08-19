import { IGameEvent, TriggerScope } from 'shared'
import type { AbilityTrigger } from './interfaces'
import type { GameState } from './game-state'

// ---------------------------------------------------------------------------
// When a game event starts an ability. The mirror of expiries.ts, which says
// when one ends an effect — TaskManager evaluates expiry first, so an effect
// ending on an event is gone for anything that same event fires.
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

    case TriggerScope.CarrierCard: {
      const { cardId } = (event.getPayload() ?? {}) as { cardId?: string }
      return !!cardId && gs.getEquippedItem(cardId) === source.sourceCardId
    }

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
