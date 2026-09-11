import { CardType, HeroCardData, HeroClass, PartyLeaderData } from 'shared'
import { ItemCard } from '../cards/item-card'
import { buildCard } from '../cards/card-factory'
import { SlayMonsters } from './win-conditions'
import { GameEventEmitter } from '../events/game-event-emitter'
import { AllClassesInParty } from './win-conditions'
import { InMemoryCardRepository } from '../repositories/in-memory-card-repository'
import { baseGameCards } from '../../data/base-game-cards'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { GameState } from '../pipelines/game-state'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { PartyLeaderCard } from '../cards/party-leader-card'

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

/** Puts a printed hero in a party AND on the board: the class the win reads is
 * the board's, so a mask can change it. */
const field = (
  gs: GameState,
  repo: InMemoryCardRepository,
  party: Party,
  id: string,
) => {
  if (!gs.getCard(id)) gs.registerCard(buildCard(repo.getById(id)!))
  party.addHero(id, silentEm, 'Played')
}
/** Every table below is one seat: the win is asked of that one party. */
const met = (
  condition: { isMetBy(gs: GameState, player: Player): boolean },
  gs: GameState,
) => condition.isMetBy(gs, gs.getPlayer('player-1')!)

const setupPlayer = (gs: GameState, playerId: string) => {
  gs.registerPlayer(makePlayer(playerId))
  gs.registerParty(makeParty(playerId))
  return gs.getParty(playerId)
}

describe('win-condition', () => {
  it('is unmet under the monster count', () => {
    const gs = makeGs()
    const p = setupPlayer(gs, 'player-1')
    const condition = new SlayMonsters(3)
    expect(met(condition, gs)).toBe(false)
    p.addMonster('monster-1')
    expect(met(condition, gs)).toBe(false)
    p.addHero('hero-1', silentEm, 'Played')
    expect(met(condition, gs)).toBe(false)
  })

  it('is met at 3+ monsters', () => {
    const gs = makeGs()
    const p = setupPlayer(gs, 'player-1')
    const condition = new SlayMonsters(3)
    p.addMonster('monster-1')
    p.addMonster('monster-2')
    p.addMonster('monster-3')
    expect(met(condition, gs)).toBe(true)
    p.addMonster('monster-4')
    expect(met(condition, gs)).toBe(true)
  })

  const makeRepo = () => {
    const repo = new InMemoryCardRepository()
    repo.addMany(baseGameCards)
    return repo
  }

  describe('AllClassesInParty', () => {
    it('is unmet when the party has no classes', () => {
      const repo = makeRepo()
      const gs = makeGs()
      setupPlayer(gs, 'player-1')
      const condition = new AllClassesInParty(repo)
      expect(met(condition, gs)).toBe(false)
    })

    it('is met when the party fields all 6 classes', () => {
      const repo = makeRepo()
      const gs = makeGs()
      const party = setupPlayer(gs, 'player-1')
      field(gs, repo, party, 'hero-041') // bard
      field(gs, repo, party, 'hero-040') // wizard
      field(gs, repo, party, 'hero-025') // guardian
      field(gs, repo, party, 'hero-024') // thief
      field(gs, repo, party, 'hero-009') // ranger
      field(gs, repo, party, 'hero-008') // fighter
      const condition = new AllClassesInParty(repo)
      expect(met(condition, gs)).toBe(true)
    })

    it('counts a masked hero as the mask\'s class — a second Wizard in the Fighter Mask is the sixth', () => {
      const repo = makeRepo()
      const gs = makeGs()
      const party = setupPlayer(gs, 'player-1')
      field(gs, repo, party, 'hero-041') // bard
      field(gs, repo, party, 'hero-040') // wizard
      field(gs, repo, party, 'hero-025') // guardian
      field(gs, repo, party, 'hero-024') // thief
      field(gs, repo, party, 'hero-009') // ranger
      field(gs, repo, party, 'hero-039') // another wizard …
      gs.registerCard(
        new ItemCard({
          id: 'item-067',
          name: 'Fighter Mask',
          type: CardType.Item,
          image: '',
          description: '',
          set: 'base',
          cursed: false,
          heroClass: HeroClass.Fighter,
        }),
      )
      party.equipItem('hero-039', 'item-067') // … read as a Fighter
      const condition = new AllClassesInParty(repo)
      expect(met(condition, gs)).toBe(true)
    })

    it('is unmet when the party is missing one class', () => {
      const repo = makeRepo()
      const gs = makeGs()
      const party = setupPlayer(gs, 'player-1')
      field(gs, repo, party, 'hero-041') // bard
      field(gs, repo, party, 'hero-040') // wizard
      field(gs, repo, party, 'hero-025') // guardian
      field(gs, repo, party, 'hero-024') // thief
      field(gs, repo, party, 'hero-009') // ranger
      // missing fighter
      const condition = new AllClassesInParty(repo)
      expect(met(condition, gs)).toBe(false)
    })

    it('should not count duplicate classes', () => {
      const repo = makeRepo()
      const gs = makeGs()
      const party = setupPlayer(gs, 'player-1')
      field(gs, repo, party, 'hero-041') // bard
      field(gs, repo, party, 'hero-040') // wizard
      field(gs, repo, party, 'hero-025') // guardian
      field(gs, repo, party, 'hero-024') // thief
      field(gs, repo, party, 'hero-009') // ranger
      field(gs, repo, party, 'hero-009') // ranger again — duplicate
      const condition = new AllClassesInParty(repo)
      expect(met(condition, gs)).toBe(false)
    })
  })
})

describe('AllClassesInParty — the leader', () => {
  const heroOf = (heroClass: HeroClass) =>
    baseGameCards.find((c) => c.type === CardType.Hero && (c as HeroCardData).heroClass === heroClass)!.id

  it("counts the Party Leader's class: five hero classes and a leader of the sixth win", () => {
    const gs = makeGs()
    const repo = new InMemoryCardRepository()
    repo.addMany(baseGameCards)
    const party = setupPlayer(gs, 'player-1')
    const printedLeader = baseGameCards.find((c) => c.type === CardType.Leader && (c as PartyLeaderData).heroClass === HeroClass.Fighter)!
    gs.registerCard(new PartyLeaderCard({ ...printedLeader, id: 'leader-player-1' } as never))
    for (const cls of [HeroClass.Bard, HeroClass.Guardian, HeroClass.Ranger, HeroClass.Thief, HeroClass.Wizard]) {
      field(gs, repo, party, heroOf(cls))
    }

    expect(met(new AllClassesInParty(repo), gs)).toBe(true)
  })

  it('does not count a leader of a class a hero already brings', () => {
    const gs = makeGs()
    const repo = new InMemoryCardRepository()
    repo.addMany(baseGameCards)
    const party = setupPlayer(gs, 'player-1')
    const printedLeader = baseGameCards.find((c) => c.type === CardType.Leader && (c as PartyLeaderData).heroClass === HeroClass.Bard)!
    gs.registerCard(new PartyLeaderCard({ ...printedLeader, id: 'leader-player-1' } as never))
    for (const cls of [HeroClass.Bard, HeroClass.Guardian, HeroClass.Ranger, HeroClass.Thief, HeroClass.Wizard]) {
      field(gs, repo, party, heroOf(cls))
    }

    expect(met(new AllClassesInParty(repo), gs)).toBe(false)
  })
})
