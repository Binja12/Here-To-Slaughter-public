import { CardView, PlayerView } from '../contract'
import { PlayerId } from './layout'
import { slotForPlayer, slotsFor } from './seats'
import { TargetKey, tkey } from './targeting'

export function allCards(view: PlayerView): CardView[] {
  return [
    ...view.hand,
    ...view.monsterRow,
    ...view.discardPile,
    ...view.parties.flatMap((party) => [
      party.leader,
      ...party.heroes.flatMap((hero) =>
        hero.equippedItem ? [hero.card, hero.equippedItem] : [hero.card],
      ),
      ...party.monsters,
      ...party.instanceCards,
    ]),
  ]
}

export const cardById = (view: PlayerView, cardId?: string) =>
  cardId ? allCards(view).find((card) => card.id === cardId) : undefined

/** Active instance cards are presented on top of the public discard pile.
 * De-duplicate by physical card id in case the server also includes an
 * instance in discardPile while its reaction window is open. */
export function discardCardsForView(view: PlayerView): CardView[] {
  const instances = view.parties.flatMap((party) => party.instanceCards)
  const instanceIds = new Set(instances.map((card) => card.id))
  return [
    ...instances,
    ...view.discardPile.filter((card) => !instanceIds.has(card.id)),
  ]
}

export function targetKeyForId(
  view: PlayerView,
  id: unknown,
): TargetKey | null {
  if (typeof id !== 'string') return null
  const handIndex = view.hand.findIndex((card) => card.id === id)
  if (handIndex >= 0) return tkey.handCard(handIndex)

  const discardIndex = discardCardsForView(view).findIndex(
    (card) => card.id === id,
  )
  if (discardIndex >= 0) return tkey.discardCard(discardIndex)

  for (const party of view.parties) {
    const slot = slotForPlayer(view, party.playerId)
    if (!slot) continue
    const heroIndex = party.heroes.findIndex((hero) => hero.card.id === id)
    if (heroIndex >= 0) return tkey.hero(slot, heroIndex)
    const itemIndex = party.heroes.findIndex(
      (hero) => hero.equippedItem?.id === id,
    )
    if (itemIndex >= 0) return tkey.item(slot, itemIndex)
    if (party.leader.id === id) return tkey.leader(slot)
    const monsterIndex = party.monsters.findIndex((card) => card.id === id)
    if (monsterIndex >= 0) return tkey.slainMonster(slot, monsterIndex)
  }

  const monsterIndex = view.monsterRow.findIndex((card) => card.id === id)
  if (monsterIndex >= 0) return tkey.monster(monsterIndex)

  const playerSlot = slotForPlayer(view, id)
  return playerSlot ? tkey.handStack(playerSlot) : null
}

export function idForTargetKey(
  view: PlayerView,
  key: TargetKey,
): string | null {
  const [kind, a, b] = key.split(':')
  const slots = slotsFor(view)
  const playerId = slots[a as PlayerId]
  const party = playerId
    ? view.parties.find((entry) => entry.playerId === playerId)
    : undefined

  switch (kind) {
    case 'handCard':
      return view.hand[Number(a)]?.id ?? null
    case 'handStack':
      return slots[a as PlayerId] ?? null
    case 'hero':
      return party?.heroes[Number(b)]?.card.id ?? null
    case 'item':
      return party?.heroes[Number(b)]?.equippedItem?.id ?? null
    case 'leader':
      return party?.leader.id ?? null
    case 'slainMonster':
      return party?.monsters[Number(b)]?.id ?? null
    case 'monster':
      return view.monsterRow[Number(a)]?.id ?? null
    case 'discard':
      return discardCardsForView(view)[0]?.id ?? null
    case 'discardCard':
      return discardCardsForView(view)[Number(a)]?.id ?? null
    case 'pendingWindow':
      return a ?? null
    default:
      return null
  }
}
