import { ItemCard } from './item-card'
import { CardType } from 'shared'
import { ItemCardData } from 'shared'
import { GameState } from '../pipelines/game-state'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'

const mockItemData: ItemCardData = {
  id: 'item-1',
  name: 'Magic Sword',
  type: CardType.Item,
  image: 'sword.png',
  description: 'A powerful sword',
  cursed: false,
  set: 'base',
}

const mockCursedItemData: ItemCardData = {
  ...mockItemData,
  id: 'item-2',
  name: 'Cursed Dagger',
  cursed: true,
}

describe('ItemCard', () => {
  it('should return id', () => {
    const card = new ItemCard(mockItemData)
    expect(card.getId()).toBe('item-1')
  })

  it('should return name', () => {
    const card = new ItemCard(mockItemData)
    expect(card.getName()).toBe('Magic Sword')
  })

  it('should return type as CardType.Item', () => {
    const card = new ItemCard(mockItemData)
    expect(card.getType()).toBe(CardType.Item)
  })

  it('should return image', () => {
    const card = new ItemCard(mockItemData)
    expect(card.getImage()).toBe('sword.png')
  })

  it('should return description', () => {
    const card = new ItemCard(mockItemData)
    expect(card.getDescription()).toBe('A powerful sword')
  })

  it('should return cursed false', () => {
    const card = new ItemCard(mockItemData)
    expect(card.isCursed()).toBe(false)
  })

  it('should return cursed true', () => {
    const card = new ItemCard(mockCursedItemData)
    expect(card.isCursed()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Equipment lives on the party, so these ask the board. The GameState import
// is type-only, so there is no runtime edge back from a card to the board.
// ---------------------------------------------------------------------------

const makeBoard = (heroIds: string[] = ['hero-1']) => {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  gs.registerParty(
    new Party({
      playerId: 'p1',
      leaderId: 'p1-leader',
      heroIds,
      monsterIds: [],
    }),
  )
  return gs
}

describe('ItemCard — equipment', () => {
  it('names the hero wearing it', () => {
    const gs = makeBoard()
    gs.getParty('p1').equipItem('hero-1', 'item-1')

    expect(new ItemCard(mockItemData).getEquippedTo(gs)).toBe('hero-1')
  })

  it('names nobody while it is not in play', () => {
    expect(new ItemCard(mockItemData).getEquippedTo(makeBoard())).toBeUndefined()
  })

  it('names nobody once its carrier has gone', () => {
    const gs = makeBoard([])

    expect(new ItemCard(mockItemData).getEquippedTo(gs)).toBeUndefined()
  })
})
