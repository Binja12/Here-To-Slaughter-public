import { EffectView, PendingWindowView, PlayerView } from '../contract'
import { bonusesOf } from './liveRoll'

/**
 * Which cards wear the pink "effect working" aura RIGHT NOW.
 *
 * the owner's rule (2026-09-04): a standing effect glows only while it is
 * RELEVANT — the Fist of Reason during a challenge window, the Protecting
 * Horn while a modifier could be played, Mega Slime while its owner is over
 * the printed budget — never all game long just because it is installed.
 * The rules below are one line per effect type, read off the seats' effect
 * lists and the open windows; a roll's own bonus sources (named by the
 * server) always glow, they are the effect being applied.
 */

/**
 * The engine's per-turn budget (`actionPointsPerTurn` in game-config.ts) —
 * a MIRROR like AP_COST: an ActionPointBonus is "working" while its owner
 * holds more than that.
 */
export const AP_PER_TURN = 3

/**
 * Leaders whose printed rule is a TRIGGER rather than a standing effect, so
 * nothing in the seats' effect lists names them; when they matter is a rule
 * of their own, keyed by name like the art is.
 */
const TRIGGER_LEADERS: Record<string, (view: PlayerView, ownerId: string) => boolean> = {
  // "+1 or -1 on each Modifier you play": while a modifier could be played
  'The Protecting Horn': (view) => view.pendingWindows.some(modifiable),
}

const TABLE = new Set(['Modifier', 'Attack', 'Challenge'])

/** A window a modifier may currently land in (mirrors playable.ts). */
const modifiable = (window: PendingWindowView): boolean =>
  window.type === 'Modifier' ||
  window.type === 'Attack' ||
  (window.type === 'Challenge' && window.detail?.challenged === true)

/** `ownerId` is rolling, or contesting, in this window. */
const rollsIn = (window: PendingWindowView, ownerId: string): boolean => {
  if (window.type === 'Modifier' || window.type === 'Attack') return window.respondentId === ownerId
  if (window.type === 'Challenge' && window.detail?.challenged === true) {
    return window.detail.challengerId === ownerId || window.detail.defenderId === ownerId
  }
  return false
}

/** `ownerId` could still challenge this window's card, or already did. */
const challengesIn = (window: PendingWindowView, ownerId: string): boolean => {
  if (window.type !== 'Challenge') return false
  const detail = window.detail ?? {}
  if (detail.challenged === true) return detail.challengerId === ownerId
  return window.respondentId !== ownerId
}

const subjectOf = (window: PendingWindowView): unknown =>
  window.cardId ?? window.detail?.heroId ?? window.detail?.monsterId

function rollBonusRelevant(view: PlayerView, effect: EffectView, ownerId: string): boolean {
  return view.pendingWindows.some((window) => {
    // scoped to one hero (a ring, a curse): only that hero's roll
    if (effect.cardId && subjectOf(window) !== effect.cardId) return false
    switch (effect.rollContext) {
      case 'Challenge':
        return challengesIn(window, ownerId)
      case 'Attack':
        return window.type === 'Attack' && window.respondentId === ownerId
      case 'HeroEffect':
        return window.type === 'Modifier' && window.respondentId === ownerId
      default:
        return rollsIn(window, ownerId) || challengesIn(window, ownerId)
    }
  })
}

function relevant(view: PlayerView, effect: EffectView, ownerId: string): boolean {
  switch (effect.type) {
    case 'RollBonus':
      return rollBonusRelevant(view, effect, ownerId)
    case 'ModifierCounterBonus':
      // somebody could land a modifier on the owner's roll
      return view.pendingWindows.some((window) => modifiable(window) && rollsIn(window, ownerId))
    case 'ActionPointBonus':
      return (view.seats.find((seat) => seat.playerId === ownerId)?.actionPoints ?? 0) > AP_PER_TURN
    case 'CantBeStolen':
    case 'CantBeDestroyed':
    case 'TakesTheHit':
      // an opponent is picking a card — the owner's heroes are shielded from it
      return view.pendingWindows.some(
        (window) => window.type === 'CardChoice' && window.respondentId !== ownerId,
      )
    case 'StealsInsteadOfDestroy':
      return view.pendingWindows.some(
        (window) => window.type === 'CardChoice' && window.respondentId === ownerId,
      )
    case 'CantBeChallenged':
      // the owner's play is on the table
      return view.pendingWindows.some(
        (window) => window.type === 'Challenge' && window.respondentId === ownerId,
      )
    case 'CantUseHeroEffect':
      // the sealed hero's owner could otherwise roll on it
      return view.currentPlayerId === ownerId
    default:
      return false
  }
}

/** Ids of every card whose effect is working right now, at every seat. */
export function passiveSourceIds(view: PlayerView): Set<string> {
  const ids = new Set<string>()
  for (const seat of view.seats) {
    for (const effect of seat.effects) {
      if (relevant(view, effect, seat.playerId)) ids.add(effect.sourceCardId)
    }
  }
  for (const party of view.parties) {
    const rule = TRIGGER_LEADERS[party.leader.name]
    if (rule && rule(view, party.playerId)) ids.add(party.leader.id)
  }
  // the open roll's bonus sources, named by the server: the effect applied
  for (const window of view.pendingWindows) {
    if (!TABLE.has(window.type)) continue
    const detail = window.detail ?? {}
    for (const list of [detail.bonuses, detail.challengerBonuses, detail.challengedBonuses]) {
      for (const bonus of bonusesOf(list)) if (bonus.cardSource) ids.add(bonus.cardSource)
    }
  }
  return ids
}
