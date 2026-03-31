import { ItemCard } from './item-card'
import { CardType, EffectDuration } from 'shared'
import { ItemCardData } from 'shared'

const mockItemData: ItemCardData = {
  id: 'item-1',
  name: 'Magic Sword',
  type: CardType.Item,
  image: 'sword.png',
  description: 'A powerful sword',
  cursed: false,
  effect: {
    rollBonus: 2,
    duration: EffectDuration.Permanent,
  },
}

const mockCursedItemData: ItemCardData = {
  ...mockItemData,
  id: 'item-2',
  name: 'Cursed Dagger',
  cursed: true,
  effect: {
    attackBonus: -2,
    duration: EffectDuration.Permanent,
  },
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

  it('should return effect', () => {
    const card = new ItemCard(mockItemData)
    expect(card.getEffect()).toEqual(mockItemData.effect)
  })

  it('should return cursed false', () => {
    const card = new ItemCard(mockItemData)
    expect(card.isCursed()).toBe(false)
  })

  it('should return cursed true', () => {
    const card = new ItemCard(mockCursedItemData)
    expect(card.isCursed()).toBe(true)
  })

  it('should return null when not equipped', () => {
    const card = new ItemCard(mockItemData)
    expect(card.getEquippedTo()).toBeNull()
  })

  it('should equip to a hero', () => {
    const card = new ItemCard(mockItemData)
    card.equipTo('hero-1')
    expect(card.getEquippedTo()).toBe('hero-1')
  })
})
