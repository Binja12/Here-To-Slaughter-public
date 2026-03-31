import { MagicCard } from './magic-card'
import { CardType, EffectDuration } from 'shared'
import { MagicCardData } from 'shared'

const mockMagicData: MagicCardData = {
  id: 'magic-1',
  name: 'Fireball',
  type: CardType.Magic,
  image: 'fireball.png',
  description: 'Deals massive damage',
  effect: {
    attackBonus: 3,
    duration: EffectDuration.TurnEnd,
  },
}

describe('MagicCard', () => {
  it('should return id', () => {
    const card = new MagicCard(mockMagicData)
    expect(card.getId()).toBe('magic-1')
  })

  it('should return name', () => {
    const card = new MagicCard(mockMagicData)
    expect(card.getName()).toBe('Fireball')
  })

  it('should return type as CardType.Magic', () => {
    const card = new MagicCard(mockMagicData)
    expect(card.getType()).toBe(CardType.Magic)
  })

  it('should return image', () => {
    const card = new MagicCard(mockMagicData)
    expect(card.getImage()).toBe('fireball.png')
  })

  it('should return description', () => {
    const card = new MagicCard(mockMagicData)
    expect(card.getDescription()).toBe('Deals massive damage')
  })

  it('should return effect', () => {
    const card = new MagicCard(mockMagicData)
    expect(card.getEffect()).toEqual(mockMagicData.effect)
  })
})
