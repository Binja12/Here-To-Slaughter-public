import { Audience, CardType, GameEventType, HeroClass, IGameEvent } from 'shared'
import { DrawTask, DiscardTask, DestroyTask } from './tasks'
import { GameState } from '../game-state'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { Player } from '../player'
import { Party } from '../party'
import { HeroCard } from '../cards/hero-card'
import { AbilityContext, CTX_LAST_DRAWN_CARD_ID } from '../ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const makeGs = (deckCards: string[] = []) => {
  const deck = new CardStack('deck', 'main')
  for (const c of deckCards) deck.addToBottom(c)
  return new GameState(
    deck,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
}

const makePlayer = (id: string, hand: string[] = []) =>
  new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 })

const makeParty = (playerId: string, heroIds: string[] = []) =>
  new Party({ playerId, leaderId: `${playerId}-leader`, heroIds, monsterIds: [] })

const makeHeroCard = (id: string) =>
  new HeroCard({
    id, name: id, type: CardType.Hero, image: '', description: '',
    set: 'test', heroClass: HeroClass.Fighter, rollReq: 5,
  })

const makeCtx = (sourceCardId = 'src-card', ownerId = 'p1') =>
  new AbilityContext(sourceCardId, ownerId)

/** Returns an emitter pre-wired with a spy that collects every emitted event. */
const makeEmitter = () => {
  const emitter = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  emitter.addListener({ onEvent: (e) => emitted.push(e) })
  return { emitter, emitted }
}

// ---------------------------------------------------------------------------
// DrawTask
// ---------------------------------------------------------------------------

describe('DrawTask', () => {
  it('draws N cards and adds them to the owner hand', () => {
    const gs = makeGs(['card-1', 'card-2'])
    const player = makePlayer('p1')
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    const { emitter } = makeEmitter()

    new DrawTask(2).execute(gs, makeCtx(), emitter)

    expect(player.getHand()).toContain('card-1')
    expect(player.getHand()).toContain('card-2')
  })

  it('emits one CardDrawn (PlayerOnly) event per card, immediately as each card is drawn', () => {
    const gs = makeGs(['card-1', 'card-2', 'card-3'])
    const player = makePlayer('p1')
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    const { emitter, emitted } = makeEmitter()

    // Record hand size at the moment each CardDrawn fires to prove immediate emission
    const handSizeAtEmit: number[] = []
    emitter.addListener({
      onEvent: (e) => {
        if (e.getType() === GameEventType.CardDrawn) handSizeAtEmit.push(player.getHand().length)
      },
    })

    new DrawTask(3).execute(gs, makeCtx(), emitter)

    const drawEvents = emitted.filter((e) => e.getType() === GameEventType.CardDrawn)
    expect(drawEvents).toHaveLength(3)
    expect(drawEvents.every((e) => e.getAudience() === Audience.PlayerOnly)).toBe(true)
    // Each event fired while that specific card was already in hand
    expect(handSizeAtEmit).toEqual([1, 2, 3])
  })

  it('stores the last drawn cardId in context', () => {
    const gs = makeGs(['card-1', 'card-2'])
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1'))
    const ctx = makeCtx()
    const { emitter } = makeEmitter()

    new DrawTask(2).execute(gs, ctx, emitter)

    expect(ctx.get(CTX_LAST_DRAWN_CARD_ID)).toBe('card-2')
  })

  it('stops early and emits only as many events as cards drawn', () => {
    const gs = makeGs(['only-card'])
    const player = makePlayer('p1')
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    const { emitter, emitted } = makeEmitter()

    new DrawTask(3).execute(gs, makeCtx(), emitter)

    expect(emitted).toHaveLength(1)
    expect(player.getHand()).toHaveLength(1)
  })

  it('emits nothing when owner is not found', () => {
    const gs = makeGs(['card-1'])
    const { emitter, emitted } = makeEmitter()

    new DrawTask(1).execute(gs, makeCtx('src', 'unknown'), emitter)

    expect(emitted).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// DiscardTask
// ---------------------------------------------------------------------------

describe('DiscardTask', () => {
  it('removes the explicit cardId from hand and adds it to the discard pile', () => {
    const gs = makeGs()
    const player = makePlayer('p1', ['card-1', 'card-2'])
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    const { emitter } = makeEmitter()

    new DiscardTask('card-1').execute(gs, makeCtx(), emitter)

    expect(player.getHand()).not.toContain('card-1')
    expect(player.getHand()).toContain('card-2')
    expect(gs.getDiscardPile().getAll()).toContain('card-1')
  })

  it('emits CardDiscarded (All) immediately', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', ['card-1']))
    gs.registerParty(makeParty('p1'))
    const { emitter, emitted } = makeEmitter()

    new DiscardTask('card-1').execute(gs, makeCtx(), emitter)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].getType()).toBe(GameEventType.CardDiscarded)
    expect(emitted[0].getAudience()).toBe(Audience.All)
    expect((emitted[0].getPayload() as any).cardId).toBe('card-1')
  })

  it('defaults to ctx.sourceCardId when no explicit cardId is given', () => {
    const gs = makeGs()
    const player = makePlayer('p1', ['src-card'])
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    const { emitter } = makeEmitter()

    new DiscardTask().execute(gs, makeCtx('src-card'), emitter)

    expect(player.getHand()).not.toContain('src-card')
    expect(gs.getDiscardPile().getAll()).toContain('src-card')
  })

  it('emits nothing when the card is not in hand', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', []))
    gs.registerParty(makeParty('p1'))
    const { emitter, emitted } = makeEmitter()

    new DiscardTask('missing').execute(gs, makeCtx(), emitter)

    expect(emitted).toHaveLength(0)
  })

  it('emits nothing when owner is not found', () => {
    const gs = makeGs()
    const { emitter, emitted } = makeEmitter()

    new DiscardTask('card-1').execute(gs, makeCtx('src', 'unknown'), emitter)

    expect(emitted).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// DestroyTask
// ---------------------------------------------------------------------------

describe('DestroyTask', () => {
  it('removes the explicit heroId from party and adds it to the discard pile', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1', 'hero-2']))
    gs.registerCard(makeHeroCard('hero-1'))
    const { emitter } = makeEmitter()

    new DestroyTask('hero-1').execute(gs, makeCtx(), emitter)

    expect(gs.getParty('p1').getHeroIds()).not.toContain('hero-1')
    expect(gs.getParty('p1').getHeroIds()).toContain('hero-2')
    expect(gs.getDiscardPile().getAll()).toContain('hero-1')
  })

  it('emits HeroDestroyed (All) immediately', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1']))
    const { emitter, emitted } = makeEmitter()

    new DestroyTask('hero-1').execute(gs, makeCtx(), emitter)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].getType()).toBe(GameEventType.HeroDestroyed)
    expect(emitted[0].getAudience()).toBe(Audience.All)
    expect((emitted[0].getPayload() as any).cardId).toBe('hero-1')
  })

  it('defaults to ctx.sourceCardId when no explicit heroId is given', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['src-card']))
    const { emitter } = makeEmitter()

    new DestroyTask().execute(gs, makeCtx('src-card'), emitter)

    expect(gs.getParty('p1').getHeroIds()).not.toContain('src-card')
    expect(gs.getDiscardPile().getAll()).toContain('src-card')
  })

  it('emits nothing when the hero is not in the party', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', []))
    const { emitter, emitted } = makeEmitter()

    new DestroyTask('missing').execute(gs, makeCtx(), emitter)

    expect(emitted).toHaveLength(0)
  })
})
