import { SlayMonsters } from './win-conditions'
import { GameEventEmitter } from '../events/game-event-emitter'
import { AllClassesInParty } from './win-conditions'
import { InMemoryCardRepository } from '../repositories/in-memory-card-repository'
import { baseGameCards } from '../../data/base-game-cards'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { GameState } from '../game-state'
import { Player } from '../player'
import { Party } from '../party'

/** Party membership changes announce themselves; these tests ignore the events. */
const silentEm = new GameEventEmitter()

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discardPile = new CardPile('discard pile', 'discard pile')
  const monsterDeck = new CardStack('monster deck', 'main monster deck')
  const monsterPile = new CardPile('slayable monsters', 'monster pile')
  return new GameState(deck, discardPile, monsterDeck, monsterPile)
}

const makePlayer = (id: string) =>
  new Player({ id, name: `Player ${id}`, hand: [], partyId: `party-${id}`, actionPoints: 3 })

const makeParty = (playerId: string) =>
  new Party({ playerId, leaderId: `leader-${playerId}`, heroIds: [], monsterIds: [] })

const setupPlayer = (gs: GameState, playerId: string) => {
  gs.registerPlayer(makePlayer(playerId))
  gs.registerParty(makeParty(playerId))
  return gs.getParty(playerId)
}

describe('win-condition', () => {
  it('should detect no win condition', () => {
    const gs = makeGs()
    const p = setupPlayer(gs, 'player-1')
    const condition = new SlayMonsters(3)
    expect(condition.check(gs)).toBe(null)
    p.addMonster('monster-1')
    expect(condition.check(gs)).toBe(null)
    p.addHero('hero-1', silentEm, 'Played')
    expect(condition.check(gs)).toBe(null)
  })

  it('should detect win condition by 3+ monsters', () => {
    const gs = makeGs()
    const p = setupPlayer(gs, 'player-1')
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
    return repo
  }

  describe('AllClassesInParty', () => {
    it('should return null when no player has all classes', () => {
      const repo = makeRepo()
      const gs = makeGs()
      setupPlayer(gs, 'player-1')
      const condition = new AllClassesInParty(repo)
      expect(condition.check(gs)).toBeNull()
    })

    it('should return winning player when they have all 6 classes', () => {
      const repo = makeRepo()
      const gs = makeGs()
      const party = setupPlayer(gs, 'player-1')
      party.addHero('hero-041', silentEm, 'Played') // bard
      party.addHero('hero-040', silentEm, 'Played') // wizard
      party.addHero('hero-025', silentEm, 'Played') // guardian
      party.addHero('hero-024', silentEm, 'Played') // thief
      party.addHero('hero-009', silentEm, 'Played') // ranger
      party.addHero('hero-008', silentEm, 'Played') // fighter
      const condition = new AllClassesInParty(repo)
      expect(condition.check(gs)?.getId()).toBe('player-1')
    })

    it('should return null when player is missing one class', () => {
      const repo = makeRepo()
      const gs = makeGs()
      const party = setupPlayer(gs, 'player-1')
      party.addHero('hero-041', silentEm, 'Played') // bard
      party.addHero('hero-040', silentEm, 'Played') // wizard
      party.addHero('hero-025', silentEm, 'Played') // guardian
      party.addHero('hero-024', silentEm, 'Played') // thief
      party.addHero('hero-009', silentEm, 'Played') // ranger
      // missing fighter
      const condition = new AllClassesInParty(repo)
      expect(condition.check(gs)).toBeNull()
    })

    it('should not count duplicate classes', () => {
      const repo = makeRepo()
      const gs = makeGs()
      const party = setupPlayer(gs, 'player-1')
      party.addHero('hero-041', silentEm, 'Played') // bard
      party.addHero('hero-040', silentEm, 'Played') // wizard
      party.addHero('hero-025', silentEm, 'Played') // guardian
      party.addHero('hero-024', silentEm, 'Played') // thief
      party.addHero('hero-009', silentEm, 'Played') // ranger
      party.addHero('hero-009', silentEm, 'Played') // ranger again — duplicate
      const condition = new AllClassesInParty(repo)
      expect(condition.check(gs)).toBeNull()
    })
  })
})
