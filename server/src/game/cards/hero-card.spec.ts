import { HeroCard } from './hero-card'
import { CardType, HeroClass, EffectDuration, GameEventType } from 'shared'
import { HeroCardData } from 'shared'
import { IAbility, IPassive } from '../interfaces'

const mockHeroData: HeroCardData = {
  id: 'hero-1',
  name: 'Zara the Wizard',
  type: CardType.Hero,
  image: 'zara.png',
  description: 'A powerful wizard',
  heroClass: HeroClass.Wizard,
  rollReq: 4,
  effect: {
    rollBonus: 2,
    duration: EffectDuration.TurnEnd,
  },
}

describe('HeroCard', () => {
  it('should return id', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getId()).toBe('hero-1')
  })

  it('should return name', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getName()).toBe('Zara the Wizard')
  })

  it('should return type as CardType.Hero', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getType()).toBe(CardType.Hero)
  })

  it('should return image', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getImage()).toBe('zara.png')
  })

  it('should return description', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getDescription()).toBe('A powerful wizard')
  })

  it('should return hero class', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getHeroClass()).toBe(HeroClass.Wizard)
  })

  it('should return roll requirement', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getRollReq()).toBe(4)
  })

  it('should return effect', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getEffect()).toEqual(mockHeroData.effect)
  })

  it('should return null when no item equipped', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getEquippedItem()).toBeNull()
  })

  it('should equip an item', () => {
    const card = new HeroCard(mockHeroData)
    card.equipItem('item-1')
    expect(card.getEquippedItem()).toBe('item-1')
  })

  it('should replace equipped item', () => {
    const card = new HeroCard(mockHeroData)
    card.equipItem('item-1')
    expect(card.getEquippedItem()).toBe('item-1')
  })
  it('should return undefined ability when none provided', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getAbility()).toBeUndefined()
  })

  it('should return the provided ability', () => {
    const ability: IAbility = { steps: [] }
    const card = new HeroCard(mockHeroData, ability)
    expect(card.getAbility()).toBe(ability)
  })

  it('should return empty passives by default', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getPassives()).toEqual([])
  })

  it('should return the provided passives', () => {
    const passive: IPassive = { trigger: GameEventType.CardDrawn, steps: [] }
    const card = new HeroCard(mockHeroData, undefined, [passive])
    expect(card.getPassives()).toEqual([passive])
  })
})
