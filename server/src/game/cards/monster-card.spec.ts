import { MonsterCard } from './monster-card'
import { CardType, GameEventType, HeroClass, RollCompareMode, RollResult } from 'shared'
import { MonsterCardData } from 'shared'

const mockMonsterData: MonsterCardData = {
  id: 'monster-1',
  name: 'Dragon',
  type: CardType.Monster,
  image: 'dragon.png',
  description: 'A fearsome dragon',
  set: 'base',
  ability: { trigger: GameEventType.MonsterSlain },
  higherReq: 8,
  lowerReq: 3,
  rollCompareMode: RollCompareMode.HighToWin,
  partyReq: {
    classes: [HeroClass.Wizard, 'Any'],
  },
}

/** LowToWin flips the comparison: roll <= higherReq slays. */
const mockLowToWinData: MonsterCardData = {
  ...mockMonsterData,
  id: 'monster-2',
  higherReq: 4,
  lowerReq: 10,
  rollCompareMode: RollCompareMode.LowToWin,
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

  it('should return party requirement', () => {
    const card = new MonsterCard(mockMonsterData)
    expect(card.getPartyReq()).toEqual(mockMonsterData.partyReq)
  })

  describe('trySlay() — HighToWin', () => {
    it('slays when roll meets higherReq', () => {
      const card = new MonsterCard(mockMonsterData)
      expect(card.trySlay(8)).toBe(RollResult.Slay)
    })

    it('fights back when roll is at or below lowerReq', () => {
      const card = new MonsterCard(mockMonsterData)
      expect(card.trySlay(3)).toBe(RollResult.FightBack)
    })

    it('misses when roll falls between lowerReq and higherReq', () => {
      const card = new MonsterCard(mockMonsterData)
      expect(card.trySlay(5)).toBe(RollResult.Miss)
    })
  })

  describe('trySlay() — LowToWin', () => {
    it('slays when roll is at or below higherReq', () => {
      const card = new MonsterCard(mockLowToWinData)
      expect(card.trySlay(3)).toBe(RollResult.Slay)
    })

    it('fights back when roll is at or above lowerReq', () => {
      const card = new MonsterCard(mockLowToWinData)
      expect(card.trySlay(11)).toBe(RollResult.FightBack)
    })

    it('misses when roll falls between higherReq and lowerReq', () => {
      const card = new MonsterCard(mockLowToWinData)
      expect(card.trySlay(7)).toBe(RollResult.Miss)
    })
  })
})
