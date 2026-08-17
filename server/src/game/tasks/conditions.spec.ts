import { CardType, HeroClass } from 'shared'
import { CardTypeCondition } from './conditions'
import { DrawTask } from './tasks'
import { GameState } from '../game-state'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import { AbilityContext, CTX_LAST_DRAWN_CARD_ID } from '../ability-context'
import { ITask } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import type { ReactionManager } from '../reactions/reaction-manager'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const makeGs = (deckCards: string[] = []) => {
  const deck = new CardStack('deck', 'main')
  for (const c of deckCards) deck.addToBottom(c)
  const gs = new GameState(
    deck,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  gs.registerPlayer(
    new Player({ id: 'p1', name: 'P1', hand: [], partyId: 'party-1', actionPoints: 3 }),
  )
  gs.registerParty(
    new Party({ playerId: 'p1', leaderId: 'leader-1', heroIds: [], monsterIds: [] }),
  )
  return gs
}

const makeCtx = () => new AbilityContext('src', 'p1')
const makeEmitter = () => new GameEventEmitter()

/** Stub ReactionManager — tasks under test don't open frames. */
const stubRm = null as unknown as ReactionManager

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'base',
  })

const makeHeroCard = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 4,
  })

// ---------------------------------------------------------------------------
// CardTypeCondition
// ---------------------------------------------------------------------------

describe('CardTypeCondition', () => {
  it('executes ifTrue branch when last drawn card matches type', () => {
    const gs = makeGs(['magic-1'])
    gs.registerCard(makeMagicCard('magic-1'))
    const ctx = makeCtx()
    new DrawTask(1).execute(gs, ctx, makeEmitter(), stubRm)

    const ran: string[] = []
    const ifTrue: ITask = { execute: () => ran.push('true') }
    const ifFalse: ITask = { execute: () => ran.push('false') }
    new CardTypeCondition(CardType.Magic, [ifTrue], [ifFalse]).execute(
      gs,
      ctx,
      makeEmitter(),
      stubRm,
    )

    expect(ran).toEqual(['true'])
  })

  it('executes ifFalse branch when last drawn card does not match type', () => {
    const gs = makeGs(['hero-1'])
    gs.registerCard(makeHeroCard('hero-1'))
    const ctx = makeCtx()
    new DrawTask(1).execute(gs, ctx, makeEmitter(), stubRm)

    const ran: string[] = []
    const ifTrue: ITask = { execute: () => ran.push('true') }
    const ifFalse: ITask = { execute: () => ran.push('false') }
    new CardTypeCondition(CardType.Magic, [ifTrue], [ifFalse]).execute(
      gs,
      ctx,
      makeEmitter(),
      stubRm,
    )

    expect(ran).toEqual(['false'])
  })

  it('executes no branch when ifFalse not provided and type does not match', () => {
    const gs = makeGs(['hero-1'])
    gs.registerCard(makeHeroCard('hero-1'))
    const ctx = makeCtx()
    new DrawTask(1).execute(gs, ctx, makeEmitter(), stubRm)

    expect(() =>
      new CardTypeCondition(CardType.Magic, []).execute(gs, ctx, makeEmitter(), stubRm),
    ).not.toThrow()
  })

  it('takes ifFalse branch when no card drawn yet (CTX_LAST_DRAWN_CARD_ID absent)', () => {
    const gs = makeGs([])
    const ctx = makeCtx()

    const ran: string[] = []
    const ifFalse: ITask = { execute: () => ran.push('false') }
    new CardTypeCondition(CardType.Magic, [], [ifFalse]).execute(
      gs,
      ctx,
      makeEmitter(),
      stubRm,
    )

    expect(ran).toEqual(['false'])
  })

  it('exposes condition, ifTrue, ifFalse on the instance', () => {
    const ifTrue: ITask = { execute: jest.fn() }
    const ifFalse: ITask = { execute: jest.fn() }
    const cond = new CardTypeCondition(CardType.Item, [ifTrue], [ifFalse])

    expect(cond.ifTrue).toEqual([ifTrue])
    expect(cond.ifFalse).toEqual([ifFalse])
    expect(typeof cond.condition).toBe('function')
  })

  it('condition reads CTX_LAST_DRAWN_CARD_ID and returns false when card id missing', () => {
    const gs = makeGs([])
    const ctx = makeCtx()
    const cond = new CardTypeCondition(CardType.Magic, [])
    expect(cond.condition(gs, ctx)).toBe(false)
  })
})
