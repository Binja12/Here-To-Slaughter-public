import { MonsterCard } from './monster-card'
import { CardType, HeroClass } from 'shared'
import { MonsterCardData } from 'shared'

const mockMonsterData: MonsterCardData = {
  id: 'monster-1',
  name: 'Dragon',
  type: CardType.Monster,
  image: 'dragon.png',
  description: 'A fearsome dragon',
  rollWinReq: 8,
  rollLoseReq: 3,
  partyReq: {
    classes: [HeroClass.Wizard, 'Any'],
  },
  skill: {
    condition: 'When face up',
    description: 'All rolls -1',
  },
}

describe('MonsterCard', () => {
  it('should return id', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getId()).toBe('monster-1')
  })

  it('should return name', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getName()).toBe('Dragon')
  })

  it('should return type as CardType.Monster', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getType()).toBe(CardType.Monster)
  })

  it('should return image', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getImage()).toBe('dragon.png')
  })

  it('should return description', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getDescription()).toBe('A fearsome dragon')
  })

  it('should return roll requirement', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getRollReq()).toBe(8)
  })

  it('should return fight back range', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getFightBackRange()).toBe(3)
  })

  it('should return party requirement', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getPartyReq()).toEqual(mockMonsterData.partyReq)
  })

  it('should return skill', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getSkill()).toEqual(mockMonsterData.skill)
  })
})
