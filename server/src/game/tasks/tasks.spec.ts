import { Audience, GameEventType, IGameEvent } from 'shared'
import { DrawTask, DiscardTask } from './tasks'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_DRAWN_CARD_IDS,
} from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import type { ReactionManager } from '../pipelines/reaction-manager'

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
  new Party({
    playerId,
    leaderId: `${playerId}-leader`,
    heroIds,
    monsterIds: [],
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

/** Stub ReactionManager — tasks under test don't open frames. */
const stubRm = null as unknown as ReactionManager

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

    new DrawTask(2).execute(gs, makeCtx(), emitter, stubRm)

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
        if (e.getType() === GameEventType.CardDrawn)
          handSizeAtEmit.push(player.getHand().length)
      },
    })

    new DrawTask(3).execute(gs, makeCtx(), emitter, stubRm)

    const drawEvents = emitted.filter(
      (e) => e.getType() === GameEventType.CardDrawn,
    )
    expect(drawEvents).toHaveLength(3)
    expect(
      drawEvents.every((e) => e.getAudience() === Audience.PlayerOnly),
    ).toBe(true)
    // Each event fired while that specific card was already in hand
    expect(handSizeAtEmit).toEqual([1, 2, 3])
  })

  it('stores every drawn cardId in context, as an array', () => {
    const gs = makeGs(['card-1', 'card-2'])
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1'))
    const ctx = makeCtx()
    const { emitter } = makeEmitter()

    new DrawTask(2).execute(gs, ctx, emitter, stubRm)

    expect(ctx.get(CTX_DRAWN_CARD_IDS)).toEqual(['card-1', 'card-2'])
  })

  it('stops early and emits only as many events as cards drawn', () => {
    const gs = makeGs(['only-card'])
    const player = makePlayer('p1')
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    const { emitter, emitted } = makeEmitter()

    new DrawTask(3).execute(gs, makeCtx(), emitter, stubRm)

    expect(emitted).toHaveLength(1)
    expect(player.getHand()).toHaveLength(1)
  })

  it('emits nothing when owner is not found', () => {
    const gs = makeGs(['card-1'])
    const { emitter, emitted } = makeEmitter()

    new DrawTask(1).execute(gs, makeCtx('src', 'unknown'), emitter, stubRm)

    expect(emitted).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// DiscardTask
// ---------------------------------------------------------------------------

describe('DiscardTask', () => {
  /** A context with the named slot already filled, as a choice would leave it. */
  const ctxWith = (cards: string[], key = CTX_CHOSEN_CARD) => {
    const ctx = makeCtx()
    ctx.set(key, cards)
    return ctx
  }

  it('moves the card named by the slot from hand to the discard pile', () => {
    const gs = makeGs()
    const player = makePlayer('p1', ['card-1', 'card-2'])
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    const { emitter } = makeEmitter()

    new DiscardTask().execute(gs, ctxWith(['card-1']), emitter, stubRm)

    expect(player.getHand()).not.toContain('card-1')
    expect(player.getHand()).toContain('card-2')
    expect(gs.getDiscardPile().getAll()).toContain('card-1')
  })

  it('emits CardDiscarded (All) immediately', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', ['card-1']))
    gs.registerParty(makeParty('p1'))
    const { emitter, emitted } = makeEmitter()

    new DiscardTask().execute(gs, ctxWith(['card-1']), emitter, stubRm)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].getType()).toBe(GameEventType.CardDiscarded)
    expect(emitted[0].getAudience()).toBe(Audience.All)
    expect((emitted[0].getPayload() as any).cardId).toBe('card-1')
  })

  it('reads whichever slot it was declared with', () => {
    const gs = makeGs()
    const player = makePlayer('p1', ['drawn-1'])
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    const { emitter } = makeEmitter()

    new DiscardTask(CTX_DRAWN_CARD_IDS).execute(
      gs,
      ctxWith(['drawn-1'], CTX_DRAWN_CARD_IDS),
      emitter,
      stubRm,
    )

    expect(gs.getDiscardPile().getAll()).toContain('drawn-1')
  })

  it('throws when nothing has written the slot — a mis-declared ability', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', ['card-1']))
    gs.registerParty(makeParty('p1'))
    const { emitter } = makeEmitter()

    expect(() =>
      new DiscardTask().execute(gs, makeCtx(), emitter, stubRm),
    ).toThrow(CTX_CHOSEN_CARD)
  })

  it('discards nothing when the player picked nothing', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', ['card-1']))
    gs.registerParty(makeParty('p1'))
    const { emitter, emitted } = makeEmitter()

    new DiscardTask().execute(gs, ctxWith([]), emitter, stubRm)

    expect(emitted).toHaveLength(0)
  })

  it('emits nothing when the card is not in hand', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', []))
    gs.registerParty(makeParty('p1'))
    const { emitter, emitted } = makeEmitter()

    new DiscardTask().execute(gs, ctxWith(['missing']), emitter, stubRm)

    expect(emitted).toHaveLength(0)
  })

  it('emits nothing when owner is not found', () => {
    const gs = makeGs()
    const { emitter, emitted } = makeEmitter()
    const ctx = new AbilityContext('src', 'unknown')
    ctx.set(CTX_CHOSEN_CARD, ['card-1'])

    new DiscardTask().execute(gs, ctx, emitter, stubRm)

    expect(emitted).toHaveLength(0)
  })
})
