import { ModifierCard } from './modifier-card'
import { CardType } from 'shared'
import { ModifierCardData } from 'shared'

const mockModifierData: ModifierCardData = {
  id: 'modifier-1',
  name: 'Lucky Roll',
  type: CardType.Modifier,
  image: 'lucky.png',
  description: 'Adds 2 to any roll',
  set: 'base',
  values: [2],
}

const mockModifierWithCondition: ModifierCardData = {
  ...mockModifierData,
  id: 'modifier-2',
}

describe('ModifierCard', () => {
  it('should return id', () => {
    const card = new ModifierCard(mockModifierData)
    expect(card.getId()).toBe('modifier-1')
  })

  it('should return name', () => {
    const card = new ModifierCard(mockModifierData)
    expect(card.getName()).toBe('Lucky Roll')
  })

  it('should return type as CardType.Modifier', () => {
    const card = new ModifierCard(mockModifierData)
    expect(card.getType()).toBe(CardType.Modifier)
  })

  it('should return image', () => {
    const card = new ModifierCard(mockModifierData)
    expect(card.getImage()).toBe('lucky.png')
  })

  it('should return description', () => {
    const card = new ModifierCard(mockModifierData)
    expect(card.getDescription()).toBe('Adds 2 to any roll')
  })

  it('should return values', () => {
    const card = new ModifierCard(mockModifierData)
    expect(card.getValues()).toEqual([2])
  })
})
