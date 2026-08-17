import {
  Audience,
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
} from 'shared'
import { SnowballAbility } from './snowball-ability'
import { DrawTask } from '../tasks/tasks'
import { CardTypeCondition } from '../tasks/conditions'
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
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [],
    partyId: 'party-1',
    actionPoints: 3,
  })
  const party = new Party({
    playerId: 'p1',
    leaderId: 'leader-1',
    heroIds: [],
    monsterIds: [],
  })
  const gs = new GameState(
    deck,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  gs.registerPlayer(player)
  gs.registerParty(party)
  return { gs, player }
}

const makeCtx = () => new AbilityContext('src-card', 'p1')

const makeEmitter = () => {
  const emitter = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  emitter.addListener({ onEvent: (e) => emitted.push(e) })
  return { emitter, emitted }
}

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
    heroClass: HeroClass.Wizard,
    rollReq: 4,
    set: 'base',
  })

// ---------------------------------------------------------------------------
// DrawTask
// ---------------------------------------------------------------------------

describe('DrawTask', () => {
  it('draws N cards and adds them to player hand', () => {
    const { gs, player } = makeGs(['card-1', 'card-2'])
    const { emitter } = makeEmitter()
    new DrawTask(2).execute(gs, makeCtx(), emitter, stubRm)
    expect(player.getHand()).toContain('card-1')
    expect(player.getHand()).toContain('card-2')
  })

  it('emits CardDrawn (PlayerOnly) for each card drawn', () => {
    const { gs } = makeGs(['card-1'])
    const { emitter, emitted } = makeEmitter()
    new DrawTask(1).execute(gs, makeCtx(), emitter, stubRm)
    expect(emitted).toHaveLength(1)
    expect(emitted[0].getType()).toBe(GameEventType.CardDrawn)
    expect(emitted[0].getAudience()).toBe(Audience.PlayerOnly)
  })

  it('stores last drawn cardId in context', () => {
    const { gs } = makeGs(['card-1', 'card-2'])
    const ctx = makeCtx()
    const { emitter } = makeEmitter()
    new DrawTask(2).execute(gs, ctx, emitter, stubRm)
    expect(ctx.get(CTX_LAST_DRAWN_CARD_ID)).toBe('card-2')
  })

  it('stops drawing when deck is empty', () => {
    const { gs, player } = makeGs(['card-1'])
    const { emitter, emitted } = makeEmitter()
    new DrawTask(3).execute(gs, makeCtx(), emitter, stubRm)
    expect(emitted).toHaveLength(1)
    expect(player.getHand()).toHaveLength(1)
  })

  it('emits nothing when player not found', () => {
    const deck = new CardStack('d', 'm')
    deck.addToBottom('card-1')
    const gs = new GameState(
      deck,
      new CardPile('discard', 'discard'),
      new CardStack('mdeck', 'monster-deck'),
      new CardPile('mpile', 'monster-pile'),
    )
    const { emitter, emitted } = makeEmitter()
    new DrawTask(1).execute(
      gs,
      new AbilityContext('src', 'unknown-player'),
      emitter,
      stubRm,
    )
    expect(emitted).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// CardTypeCondition
// ---------------------------------------------------------------------------

describe('CardTypeCondition', () => {
  it('executes ifTrue branch when card type matches', () => {
    const { gs } = makeGs(['magic-1'])
    gs.registerCard(makeMagicCard('magic-1'))
    const ctx = makeCtx()
    const { emitter } = makeEmitter()
    new DrawTask(1).execute(gs, ctx, emitter, stubRm) // draws magic-1 → sets CTX_LAST_DRAWN_CARD_ID

    const ran: string[] = []
    const ifTrue: ITask = { execute: () => { ran.push('true') } }
    const ifFalse: ITask = { execute: () => { ran.push('false') } }
    new CardTypeCondition(CardType.Magic, [ifTrue], [ifFalse]).execute(gs, ctx, emitter, stubRm)
    expect(ran).toEqual(['true'])
  })

  it('executes ifFalse branch when card type does not match', () => {
    const { gs } = makeGs(['hero-1'])
    gs.registerCard(makeHeroCard('hero-1'))
    const ctx = makeCtx()
    const { emitter } = makeEmitter()
    new DrawTask(1).execute(gs, ctx, emitter, stubRm)

    const ran: string[] = []
    const ifTrue: ITask = { execute: () => { ran.push('true') } }
    const ifFalse: ITask = { execute: () => { ran.push('false') } }
    new CardTypeCondition(CardType.Magic, [ifTrue], [ifFalse]).execute(gs, ctx, emitter, stubRm)
    expect(ran).toEqual(['false'])
  })

  it('executes no branch when ifFalse not provided and type does not match', () => {
    const { gs } = makeGs(['hero-1'])
    gs.registerCard(makeHeroCard('hero-1'))
    const ctx = makeCtx()
    const { emitter } = makeEmitter()
    new DrawTask(1).execute(gs, ctx, emitter, stubRm)
    expect(() =>
      new CardTypeCondition(CardType.Magic, []).execute(gs, ctx, emitter, stubRm),
    ).not.toThrow()
  })

  it('takes ifFalse branch when no card drawn yet', () => {
    const { gs } = makeGs([])
    const ctx = makeCtx()
    const { emitter } = makeEmitter()
    const ran: string[] = []
    const ifFalse: ITask = { execute: () => { ran.push('false') } }
    new CardTypeCondition(CardType.Magic, [], [ifFalse]).execute(gs, ctx, emitter, stubRm)
    expect(ran).toEqual(['false'])
  })
})

// ---------------------------------------------------------------------------
// SnowballAbility
// ---------------------------------------------------------------------------

describe('SnowballAbility', () => {
  it('has two steps', () => {
    expect(SnowballAbility.steps).toHaveLength(2)
  })

  it('draws a card and emits CardDrawn when deck has a non-magic card', () => {
    const { gs, player } = makeGs(['hero-1'])
    gs.registerCard(makeHeroCard('hero-1'))
    const ctx = makeCtx()
    const { emitter, emitted } = makeEmitter()
    for (const step of SnowballAbility.steps) step.execute(gs, ctx, emitter, stubRm)
    expect(emitted.some((e) => e.getType() === GameEventType.CardDrawn)).toBe(true)
    expect(player.getHand()).toContain('hero-1')
  })

  it('draws two cards when first drawn is Magic', () => {
    const { gs, player } = makeGs(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    const ctx = makeCtx()
    const { emitter, emitted } = makeEmitter()
    for (const step of SnowballAbility.steps) step.execute(gs, ctx, emitter, stubRm)
    expect(player.getHand()).toContain('magic-1')
    expect(player.getHand()).toContain('card-2')
    expect(
      emitted.filter((e) => e.getType() === GameEventType.CardDrawn),
    ).toHaveLength(2)
  })
})
