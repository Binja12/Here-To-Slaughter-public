import {
  CardType,
  HeroClass,
  HeroClassReq,
  Owner,
  RollCompareMode,
  Zone,
} from 'shared'
import { GameEventEmitter } from '../events/game-event-emitter'
import { filterCards, filterPlayers, cardsOf } from './choice-filters'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import { MonsterCard } from '../cards/monster-card'
import { AbilityContext, CTX_CHOSEN_PLAYER } from '../abilities/ability-context'
import { ItemCard } from '../cards/item-card'

/** Party membership changes announce themselves; these tests ignore the events. */
const silentEm = new GameEventEmitter()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const hero = (id: string, heroClass = HeroClass.Fighter) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass,
    rollReq: 5,
  })

const magic = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'test',
  } as never)

function seat(gs: GameState, playerId: string) {
  const player = new Player({
    id: playerId,
    name: playerId,
    hand: [],
    partyId: `${playerId}-party`,
    actionPoints: 3,
  })
  gs.registerPlayer(player)
  gs.registerParty(
    new Party({
      playerId,
      leaderId: `${playerId}-leader`,
      heroIds: [],
      monsterIds: [],
    }),
  )
  return player
}

const ctxFor = (ownerId = 'p1') => new AbilityContext('src', ownerId)

// ---------------------------------------------------------------------------
// filterPlayers
//
// Also covers every Owner scope, since the scope→ids step is a private helper
// exercised through here rather than directly.
// ---------------------------------------------------------------------------

describe('filterPlayers', () => {
  it('Self scopes to the ability owner', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    expect(filterPlayers(gs, ctxFor('p1'), { owner: Owner.Self })).toEqual(['p1'])
  })

  it('Others scopes to everyone else', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    seat(gs, 'p3')
    expect(filterPlayers(gs, ctxFor('p1'), { owner: Owner.Others })).toEqual(['p2', 'p3'])
  })

  it('All scopes to every seated player', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    expect(filterPlayers(gs, ctxFor('p1'), { owner: Owner.All })).toEqual(['p1', 'p2'])
  })

  // Late binding: the ability is declared at module load, long before any
  // player exists, so Chosen defers to whatever a ChoosePlayerTask recorded.
  it('Chosen scopes from CTX_CHOSEN_PLAYER', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    const ctx = ctxFor('p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    expect(filterPlayers(gs, ctx, { owner: Owner.Chosen })).toEqual(['p2'])
  })

  it('Chosen is empty when no player has been chosen yet', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    expect(filterPlayers(gs, ctxFor('p1'), { owner: Owner.Chosen })).toEqual([])
  })

  it('defaults to the other players', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    expect(filterPlayers(gs, ctxFor('p1'))).toEqual(['p2'])
  })

  it('leaves out excluded ids', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    seat(gs, 'p3')
    expect(
      filterPlayers(gs, ctxFor('p1'), { owner: Owner.All, excludeIds: ['p2'] }),
    ).toEqual(['p1', 'p3'])
  })
})

// ---------------------------------------------------------------------------
// filterCards
// ---------------------------------------------------------------------------

describe('filterCards', () => {
  it('reads the owner’s own hand', () => {
    const gs = makeGs()
    const p1 = seat(gs, 'p1')
    gs.registerCard(hero('hero-1'))
    p1.addToHand('hero-1')

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.Hand, owner: Owner.Self }),
    ).toEqual(['hero-1'])
  })

  // The card this whole model exists for: "look at an enemy's hand".
  it('reads another player’s hand via Owner.Others', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const p2 = seat(gs, 'p2')
    gs.registerCard(magic('magic-1'))
    p2.addToHand('magic-1')

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.Hand, owner: Owner.Others }),
    ).toEqual(['magic-1'])
  })

  it('reads the hand of a previously chosen player', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const p2 = seat(gs, 'p2')
    const p3 = seat(gs, 'p3')
    gs.registerCard(magic('theirs'))
    gs.registerCard(magic('not-theirs'))
    p2.addToHand('theirs')
    p3.addToHand('not-theirs')

    const ctx = ctxFor('p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])

    expect(filterCards(gs, ctx, { zone: Zone.Hand, owner: Owner.Chosen })).toEqual([
      'theirs',
    ])
  })

  it('gathers heroes across every enemy party', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    seat(gs, 'p3')
    gs.registerCard(hero('mine'))
    gs.registerCard(hero('theirs-a'))
    gs.registerCard(hero('theirs-b'))
    gs.getParty('p1').addHero('mine', silentEm, 'Played')
    gs.getParty('p2').addHero('theirs-a', silentEm, 'Played')
    gs.getParty('p3').addHero('theirs-b', silentEm, 'Played')

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.Party, owner: Owner.Others }),
    ).toEqual(['theirs-a', 'theirs-b'])
  })

  it('reads the shared discard pile once, regardless of owner scope', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    gs.registerCard(hero('burnt'))
    gs.getDiscardPile().add('burnt')

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.Discard, owner: Owner.All }),
    ).toEqual(['burnt'])
  })

  it('narrows by card type', () => {
    const gs = makeGs()
    const p2 = seat(gs, 'p2')
    seat(gs, 'p1')
    gs.registerCard(hero('hero-1'))
    gs.registerCard(magic('magic-1'))
    p2.addToHand('hero-1')
    p2.addToHand('magic-1')

    expect(
      filterCards(gs, ctxFor('p1'), {
        zone: Zone.Hand,
        owner: Owner.Others,
        cardType: CardType.Magic,
      }),
    ).toEqual(['magic-1'])
  })

  it('narrows by hero class', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    gs.registerCard(hero('fighter-1', HeroClass.Fighter))
    gs.registerCard(hero('wizard-1', HeroClass.Wizard))
    gs.getParty('p2').addHero('fighter-1', silentEm, 'Played')
    gs.getParty('p2').addHero('wizard-1', silentEm, 'Played')

    expect(
      filterCards(gs, ctxFor('p1'), {
        zone: Zone.Party,
        owner: Owner.Others,
        heroClass: HeroClass.Wizard,
      }),
    ).toEqual(['wizard-1'])
  })

  it('never matches a non-hero when a hero class is required', () => {
    const gs = makeGs()
    const p2 = seat(gs, 'p2')
    seat(gs, 'p1')
    gs.registerCard(magic('magic-1'))
    p2.addToHand('magic-1')

    expect(
      filterCards(gs, ctxFor('p1'), {
        zone: Zone.Hand,
        owner: Owner.Others,
        heroClass: HeroClass.Fighter,
      }),
    ).toEqual([])
  })

  it('leaves out excluded ids', () => {
    const gs = makeGs()
    const p1 = seat(gs, 'p1')
    gs.registerCard(hero('hero-1'))
    gs.registerCard(hero('hero-2'))
    p1.addToHand('hero-1')
    p1.addToHand('hero-2')

    expect(
      filterCards(gs, ctxFor('p1'), {
        zone: Zone.Hand,
        owner: Owner.Self,
        excludeIds: ['hero-1'],
      }),
    ).toEqual(['hero-2'])
  })

  it('returns an empty list in a solo game with no enemies', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    gs.registerCard(hero('mine'))
    gs.getParty('p1').addHero('mine', silentEm, 'Played')

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.Party, owner: Owner.Others }),
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Zone.MonsterPile — the face-up row, shared like Discard
// ---------------------------------------------------------------------------

/** The Dark Dragon King's shape: a Bard plus one more hero. */
const monsterCard = (id: string, classes: HeroClassReq[]) =>
  new MonsterCard({
    id,
    name: id,
    type: CardType.Monster,
    image: '',
    description: '',
    set: 'test',
    partyReq: { classes },
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
  })

function giveParty(gs: GameState, playerId: string, classes: HeroClass[]) {
  classes.forEach((cls, i) => {
    const id = `${playerId}-hero-${i}`
    gs.registerCard(hero(id, cls))
    gs.getParty(playerId).addHero(id, silentEm, 'Played')
  })
}

describe('filterCards — Zone.MonsterPile', () => {
  it('reads the row once, not once per seated player', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    gs.registerCard(monsterCard('m-1', []))
    gs.getMonsterPile().add('m-1')

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.MonsterPile }),
    ).toEqual(['m-1'])
  })

  it('ignores owner, the way Discard does', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    gs.registerCard(monsterCard('m-1', []))
    gs.getMonsterPile().add('m-1')

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.MonsterPile, owner: Owner.Others }),
    ).toEqual(['m-1'])
  })

  it('does not reach the monster DECK — face down is not offerable', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    gs.registerCard(monsterCard('m-hidden', []))
    gs.getMonsterDeck().addToBottom('m-hidden')

    expect(filterCards(gs, ctxFor('p1'), { zone: Zone.MonsterPile })).toEqual([])
  })
})

describe('filterCards — partyReqMet', () => {
  const rowOf = (...reqs: HeroClassReq[][]) => {
    const gs = makeGs()
    seat(gs, 'p1')
    reqs.forEach((classes, i) => {
      gs.registerCard(monsterCard(`m-${i}`, classes))
      gs.getMonsterPile().add(`m-${i}`)
    })
    return gs
  }

  it('offers every monster when the flag is off', () => {
    const gs = rowOf([HeroClass.Bard, 'Any'], [])
    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.MonsterPile }).sort(),
    ).toEqual(['m-0', 'm-1'])
  })

  it('drops the ones the party cannot field', () => {
    const gs = rowOf([HeroClass.Bard, 'Any'], [])
    // No heroes at all: only the monster asking for nothing survives.
    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.MonsterPile, partyReqMet: true }),
    ).toEqual(['m-1'])
  })

  it('keeps one the party grew into', () => {
    const gs = rowOf([HeroClass.Bard, 'Any'])
    giveParty(gs, 'p1', [HeroClass.Bard, HeroClass.Thief])

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.MonsterPile, partyReqMet: true }),
    ).toEqual(['m-0'])
  })

  it('is answered against the ABILITY OWNER party, not the table', () => {
    const gs = rowOf([HeroClass.Bard, 'Any'])
    seat(gs, 'p2')
    giveParty(gs, 'p2', [HeroClass.Bard, HeroClass.Thief])

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.MonsterPile, partyReqMet: true }),
    ).toEqual([])
    expect(
      filterCards(gs, ctxFor('p2'), { zone: Zone.MonsterPile, partyReqMet: true }),
    ).toEqual(['m-0'])
  })

  it('never matches a non-monster, the way heroClass rejects non-heroes', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    gs.registerCard(magic('magic-1'))
    gs.getDiscardPile().add('magic-1')

    expect(
      filterCards(gs, ctxFor('p1'), { zone: Zone.Discard, partyReqMet: true }),
    ).toEqual([])
  })
})

describe('filterCards — the top of the main deck', () => {
  it('offers the top N where they lie, still filtered by type, and moves nothing', () => {
    const main = new CardStack('deck', 'main')
    for (const id of ['a', 'b', 'c', 'd']) main.addToBottom(id)
    const gs = new GameState(main, new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }))
    for (const id of ['a', 'b', 'c', 'd']) {
      gs.registerCard(new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Thief, rollReq: 5 }))
    }
    const ctx = new AbilityContext('src', 'p1')

    expect(filterCards(gs, ctx, { zone: Zone.MainDeckTop, top: 3 })).toEqual(['a', 'b', 'c'])
    expect(filterCards(gs, ctx, { zone: Zone.MainDeckTop })).toEqual(['a'])
    expect(filterCards(gs, ctx, { zone: Zone.MainDeckTop, top: 3, cardType: CardType.Item })).toEqual([])
    expect(gs.getMainDeck().getSize()).toBe(4)
  })
})

describe('filterCards — `among`: a limit to what a slot names', () => {
  it('keeps only the zone\'s cards the slot names, in zone order; an empty slot keeps nothing', () => {
    const gs = new GameState(new CardStack('deck', 'main'), new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }))
    for (const id of ['a', 'b', 'c']) {
      gs.registerCard(new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Thief, rollReq: 5 }))
      gs.getDiscardPile().add(id)
    }
    const ctx = new AbilityContext('src', 'p1')
    ctx.set('some', ['a', 'c', 'not-on-the-pile'])

    expect(filterCards(gs, ctx, { zone: Zone.Discard })).toEqual(['c', 'b', 'a'])
    expect(filterCards(gs, ctx, { zone: Zone.Discard, among: 'some' })).toEqual(['c', 'a'])
    ctx.set('some', [])
    expect(filterCards(gs, ctx, { zone: Zone.Discard, among: 'some' })).toEqual([])
  })

  it('cardsOf reads one seat\'s own zone under the same filter', () => {
    const gs = new GameState(new CardStack('deck', 'main'), new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: ['a'], partyId: 'p1-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }))
    gs.registerPlayer(new Player({ id: 'p2', name: 'p2', hand: ['b', 'i'], partyId: 'p2-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p2', leaderId: 'p2-leader', heroIds: [], monsterIds: [] }))
    for (const id of ['a', 'b']) gs.registerCard(new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Thief, rollReq: 5 }))
    gs.registerCard(new ItemCard({ id: 'i', name: 'i', type: CardType.Item, image: '', description: '', set: 'base', cursed: false }))
    const ctx = new AbilityContext('src', 'p1')
    expect(cardsOf(gs, ctx, { zone: Zone.Hand }, 'p2')).toEqual(['b', 'i'])
    expect(cardsOf(gs, ctx, { zone: Zone.Hand, cardType: CardType.Hero }, 'p2')).toEqual(['b'])
  })
})

