import { makeTestGameState } from './test-helpers'
import { SlayMonsters } from './win-conditions'
import { AllClassesInParty } from './win-conditions'
import { InMemoryCardRepository } from '../repositories/in-memory-card-repository'
import { baseGameCards } from '../../data/base-game-cards'

describe('win-condition', () => {
  it('should detect no win condition', () => {
    const gs = makeTestGameState()
    const p = gs.getParty('player-1')!
    const condition = new SlayMonsters(3)
    expect(condition.check(gs)).toBe(null)
    p.addMonster('monster-1')
    expect(condition.check(gs)).toBe(null)
    p.addHero('hero-1')
    expect(condition.check(gs)).toBe(null)
  })
  it('should detect win condition by 3+ monsters', () => {
    const gs = makeTestGameState()
    const p = gs.getParty('player-1')!
    const condition = new SlayMonsters(3)
    p.addMonster('monster-1')
    p.addMonster('monster-2')
    p.addMonster('monster-3')
    expect(condition.check(gs)).not.toBe(null)
    p.addMonster('monster-4')
    expect(condition.check(gs)).not.toBe(null)
  })

  const makeRepo = () => {
    const repo = new InMemoryCardRepository()
    repo.addMany(baseGameCards)
    console.log('total cards loaded:', repo.getAll().length)
    console.log('available classes:', repo.getAvailableClasses())
    return repo
  }

  describe('AllClassesInParty', () => {
    it('should return null when no player has all classes', () => {
      const repo = makeRepo()
      const gs = makeTestGameState()
      const condition = new AllClassesInParty(repo)
      expect(condition.check(gs)).toBeNull()
    })

    it('should return winning player when they have all 6 classes', () => {
      const repo = makeRepo()
      const gs = makeTestGameState()
      const party = gs.getParty('player-1')!
      party.addHero('hero-041') // bard
      party.addHero('hero-040') // wizard
      party.addHero('hero-025') // guardian
      party.addHero('hero-024') // thief
      party.addHero('hero-009') // ranger
      party.addHero('hero-008') // fighter
      const condition = new AllClassesInParty(repo)
      expect(condition.check(gs)?.getId()).toBe('player-1')
    })

    it('should return null when player is missing one class', () => {
      const repo = makeRepo()
      const gs = makeTestGameState()
      const party = gs.getParty('player-1')!
      party.addHero('hero-041') // bard
      party.addHero('hero-040') // wizard
      party.addHero('hero-025') // guardian
      party.addHero('hero-024') // thief
      party.addHero('hero-009') // ranger
      // missing fighter
      const condition = new AllClassesInParty(repo)
      expect(condition.check(gs)).toBeNull()
    })

    it('should not count duplicate classes', () => {
      const repo = makeRepo()
      const gs = makeTestGameState()
      const party = gs.getParty('player-1')!
      party.addHero('hero-041') // bard
      party.addHero('hero-040') // wizard
      party.addHero('hero-025') // guardian
      party.addHero('hero-024') // thief
      party.addHero('hero-009') // ranger
      party.addHero('hero-009') // ranger again — duplicate
      const condition = new AllClassesInParty(repo)
      expect(condition.check(gs)).toBeNull()
    })
  })
})
