import { MonsterCard } from './monster-card'
import {
  CardType,
  HeroClass,
  HeroClassReq,
  RollCompareMode,
  RollResult,
} from 'shared'
import { MonsterCardData } from 'shared'

const mockMonsterData: MonsterCardData = {
  id: 'monster-1',
  name: 'Dragon',
  type: CardType.Monster,
  image: 'dragon.png',
  description: 'A fearsome dragon',
  set: 'base',
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

// ---------------------------------------------------------------------------
// canBeAttackedBy — partyReq is a MULTISET, not a set
// ---------------------------------------------------------------------------

describe('canBeAttackedBy()', () => {
  const withReq = (...classes: HeroClassReq[]) =>
    new MonsterCard({ ...mockMonsterData, partyReq: { classes } })

  const { Bard, Thief, Wizard, Fighter } = HeroClass

  it('a monster asking for nothing can be attacked by an empty party', () => {
    expect(withReq().canBeAttackedBy([])).toBe(true)
  })

  it('takes a named class from a party that fields it', () => {
    expect(withReq(Bard).canBeAttackedBy([Bard])).toBe(true)
  })

  it('refuses a party missing the named class', () => {
    expect(withReq(Bard).canBeAttackedBy([Thief, Wizard])).toBe(false)
  })

  // The Dark Dragon King (monster-133): { classes: [Bard, 'Any'] }
  describe("the Dark Dragon King's [Bard, 'Any']", () => {
    const king = () => withReq(Bard, 'Any')

    it('refuses a lone Bard — Any needs a SECOND hero', () => {
      expect(king().canBeAttackedBy([Bard])).toBe(false)
    })

    it('takes a Bard and any other class', () => {
      expect(king().canBeAttackedBy([Bard, Thief])).toBe(true)
    })

    it('takes TWO Bards — one answers Bard, the other answers Any', () => {
      expect(king().canBeAttackedBy([Bard, Bard])).toBe(true)
    })

    it('refuses two heroes when neither is a Bard', () => {
      expect(king().canBeAttackedBy([Thief, Wizard])).toBe(false)
    })

    it('takes a party larger than it asks for', () => {
      expect(king().canBeAttackedBy([Fighter, Bard, Wizard])).toBe(true)
    })
  })

  it('each entry consumes a DIFFERENT hero', () => {
    expect(withReq(Bard, Bard).canBeAttackedBy([Bard])).toBe(false)
    expect(withReq(Bard, Bard).canBeAttackedBy([Bard, Bard])).toBe(true)
  })

  it("counts 'Any' against whatever the named entries left behind", () => {
    // Two heroes, but the Bard is spent on the named entry.
    expect(withReq(Bard, 'Any', 'Any').canBeAttackedBy([Bard, Thief])).toBe(false)
    expect(withReq(Bard, 'Any', 'Any').canBeAttackedBy([Bard, Thief, Thief])).toBe(true)
  })

  it('matches named classes first, so a greedy Any cannot starve one', () => {
    // If 'Any' took the Bard, the Bard entry would fail on a Thief.
    expect(withReq('Any', Bard).canBeAttackedBy([Bard, Thief])).toBe(true)
  })

  it('a party of three Anys needs three heroes of any classes', () => {
    expect(withReq('Any', 'Any', 'Any').canBeAttackedBy([Thief, Thief])).toBe(false)
    expect(withReq('Any', 'Any', 'Any').canBeAttackedBy([Thief, Thief, Wizard])).toBe(true)
  })
})
