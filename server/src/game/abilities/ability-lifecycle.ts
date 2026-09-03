import { IGameEvent, IGameEventEmitter, TriggerScope } from 'shared'
import type { AbilityTrigger, IEffect } from '../interfaces'
import type { GameState } from '../pipelines/game-state'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// When an event STARTS a rule, and when one ENDS an effect (§7).
//
// ORDER: TaskManager.onEvent calls sweepExpired before it matches triggers, so
// an effect ending on an event is gone for anything that same event fires.
// A function rather than a listener, so that ordering stays in the caller.
//
// The lifetimes card wordings are written in are in `expiries.ts`.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Starting — when an event fires a rule
// ---------------------------------------------------------------------------

/**
 * True when `trigger` should fire for this rule on this event.
 *
 * `source` is the identity the scope resolves against. Takes the board because
 * CarrierCard and OwnerTurn are questions about position, not about the event.
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

    case TriggerScope.Attacker:
      return (
        (event.getPayload() as { cardId?: string })?.cardId ===
        source.sourceCardId
      )

    case TriggerScope.Anyone:
      return true
  }

  // Exhaustive: a new scope without a branch is a compile error here, rather
  // than a rule that silently never fires.
  const unhandled: never = trigger.scope
  throw new Error(`Unhandled trigger scope ${String(unhandled)}`)
}

/**
 * Whose run a matched rule is — the id its AbilityContext carries, and so the
 * player every step acts for.
 *
 * Every scope but one resolves against where the CARD sits, which is what
 * `abilitySources` already worked out. A monster still in the monster pile
 * sits in no party and belongs to nobody, so there is no owner there to find;
 * the attack names one, and Attacker reads it off the event. That, and not the
 * match test, is the whole difference between Attacker and SelfCard.
 */
export function ownerFor(
  source: { ownerId: string },
  trigger: AbilityTrigger,
  event: IGameEvent,
): string {
  return trigger.scope === TriggerScope.Attacker
    ? event.getPlayerId()
    : source.ownerId
}

// ---------------------------------------------------------------------------
// Ending — when an event retires an effect
// ---------------------------------------------------------------------------

/** True when one of `effect`'s expiry entries matches `event`. */
export function isEffectExpired(
  gs: GameState,
  effect: IEffect,
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

/**
 * Retires every effect this event ends, then emits `EffectExpired` for each.
 *
 * ORDER: decides before removing, so expiry cannot depend on list order; prunes
 * before announcing, so no listener sees a dead entry.
 */
export function sweepExpired(
  gs: GameState,
  em: IGameEventEmitter,
  event: IGameEvent,
): void {
  const expired: IEffect[] = []

  for (const player of gs.getPlayers()) {
    const doomed = player
      .getAllEffects()
      .filter((effect) => isEffectExpired(gs, effect, event))

    for (const effect of doomed) gs.removeEffect(player.getId(), effect.id)
    expired.push(...doomed)
  }

  for (const effect of expired) {
    em.emit(
      GameEventFactory.effectExpired(
        effect.ownerId,
        effect.id,
        effect.sourceCardId,
      ),
    )
  }
}
