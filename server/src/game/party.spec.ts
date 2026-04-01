import { Party } from './party'
import { HeroClass } from 'shared'

const mockPartyData = {
  playerId: 'player-1',
  leaderId: 'leader-1',
  heroIds: [],
  monsterIds: [],
}

describe('Party', () => {
  it('should return player id', () => {
    const party = new Party(mockPartyData)
    expect(party.getPlayerId()).toBe('player-1')
  })

  it('should return leader id', () => {
    const party = new Party(mockPartyData)
    expect(party.getLeaderId()).toBe('leader-1')
  })

  it('should add a hero', () => {
    const party = new Party(mockPartyData)
    party.addHero('hero-1')
    expect(party.getHeroIds()).toContain('hero-1')
  })

  it('should remove a hero', () => {
    const party = new Party(mockPartyData)
    party.addHero('hero-1')
    party.removeHero('hero-1')
    expect(party.getHeroIds()).not.toContain('hero-1')
  })

  it('should count slain monsters', () => {
    const party = new Party(mockPartyData)
    party.addMonster('monster-1')
    party.addMonster('monster-2')
    expect(party.getMonsterCount()).toBe(2)
  })
})
