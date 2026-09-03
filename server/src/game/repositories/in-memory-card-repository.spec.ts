import { InMemoryCardRepository } from './in-memory-card-repository'
import { CardType } from 'shared'

const mockHeroCard = {
  id: 'hero-1',
  name: 'Zara the Wizard',
  type: CardType.Hero,
  image: 'zara.png',
  description: 'A powerful wizard',
  set: 'base',
}

const mockMonsterCard = {
  id: 'monster-1',
  name: 'Dragon',
  type: CardType.Monster,
  image: 'dragon.png',
  description: 'A fearsome dragon',
  set: 'base',
}

const mockRangerCard = {
  id: 'hero-2',
  name: 'Robin the Ranger',
  type: CardType.Hero,
  image: 'robin.png',
  description: 'A skilled ranger',
  set: 'ranger-pack',
}

describe('InMemoryCardRepository', () => {
  it('should return null for unknown id', () => {
    const repo = new InMemoryCardRepository()
    expect(repo.getById('unknown')).toBeNull()
  })

  it('should find card by id', () => {
    const repo = new InMemoryCardRepository()
    repo.add(mockHeroCard)
    expect(repo.getById('hero-1')).toEqual(mockHeroCard)
  })

  it('should get cards by type', () => {
    const repo = new InMemoryCardRepository()
    repo.add(mockHeroCard)
    repo.add(mockMonsterCard)
    expect(repo.getByType(CardType.Hero)).toContainEqual(mockHeroCard)
    expect(repo.getByType(CardType.Hero)).not.toContainEqual(mockMonsterCard)
  })

  it('should get cards by set', () => {
    const repo = new InMemoryCardRepository()
    repo.add(mockHeroCard)
    repo.add(mockRangerCard)
    expect(repo.getBySet('base')).toContainEqual(mockHeroCard)
    expect(repo.getBySet('base')).not.toContainEqual(mockRangerCard)
  })

  it('should get all cards', () => {
    const repo = new InMemoryCardRepository()
    repo.add(mockHeroCard)
    repo.add(mockMonsterCard)
    expect(repo.getAll().length).toBe(2)
  })

  it('should add many cards at once', () => {
    const repo = new InMemoryCardRepository()
    repo.addMany([mockHeroCard, mockMonsterCard, mockRangerCard])
    expect(repo.getAll().length).toBe(3)
  })
})
