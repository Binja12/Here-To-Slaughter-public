import { CardType, HeroClass, Owner, Zone } from 'shared'
import { GameEventEmitter } from '../events/game-event-emitter'
import { filterCards, filterPlayers } from './choice-filters'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import { AbilityContext, CTX_CHOSEN_PLAYER } from '../abilities/ability-context'

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
