import { Audience, GameEventType, IGameEvent, HeroClass, Owner, CardType, Zone } from 'shared'
import { DiscardTask, PullCardTask, ForEachPlayerTask, RevealTask, REVEAL_MS, MarkDiscardPileTask, DiscardedCountTask, TradeHandsTask } from './tasks'
import { DrawTask } from './draw-task'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_PLAYER,
  CTX_DRAWN_CARD_IDS,
  CTX_PULLED_CARD_IDS,
  CTX_DISCARDED_CARDS,
  CTX_DISCARD_PILE_MARK,
  CTX_DISCARDED_COUNT,
} from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import type { ReactionManager } from '../pipelines/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { ItemCard } from '../cards/item-card'

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

  it("discards from the ACTOR's hand when a player slot is named — 'that player must DISCARD'", () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', ['mine']))
    gs.registerPlayer(makePlayer('p2', ['theirs']))
    const { emitter } = makeEmitter()
    const ctx = makeCtx()
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    ctx.set(CTX_CHOSEN_CARD, ['theirs'])

    new DiscardTask({ executor: 'chosen' }).execute(gs, ctx, emitter, stubRm)

    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine'])
    expect(gs.getDiscardPile().getAll()).toContain('theirs')
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

// ---------------------------------------------------------------------------
// PullCardTask — take a card out of another hand, sight unseen
// ---------------------------------------------------------------------------

describe('PullCardTask', () => {
  /** p1 pulls from p2, whose hand is `victimHand`. */
  function setup(victimHand: string[], ownHand: string[] = []) {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', [...ownHand]))
    gs.registerPlayer(makePlayer('p2', [...victimHand]))
    gs.registerParty(makeParty('p1'))
    gs.registerParty(makeParty('p2'))
    const ctx = makeCtx()
    const { emitter, emitted } = makeEmitter()
    return { gs, ctx, em: emitter, events: emitted }
  }

  afterEach(() => jest.restoreAllMocks())

  it('moves a card from the chosen hand into the owner hand', () => {
    const { gs, ctx, em } = setup(['a'])
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])

    new PullCardTask().execute(gs, ctx, em, stubRm)

    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['a'])
  })

  it('records what it took, so a later step can test it', () => {
    const { gs, ctx, em } = setup(['a'])
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])

    new PullCardTask().execute(gs, ctx, em, stubRm)

    expect(ctx.get(CTX_PULLED_CARD_IDS)).toEqual(['a'])
  })

  it('announces the pull, naming both sides', () => {
    const { gs, ctx, em, events } = setup(['a'])
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])

    new PullCardTask().execute(gs, ctx, em, stubRm)

    const pulled = events.filter(
      (e) => e.getType() === GameEventType.CardPulled,
    )
    expect(pulled).toHaveLength(1)
    expect(pulled[0].getPayload()).toEqual({
      cardId: 'a',
      fromPlayerId: 'p2',
      toPlayerId: 'p1',
    })
  })

  it('takes a RANDOM one — the puller cannot see the hand', () => {
    const { gs, ctx, em } = setup(['a', 'b', 'c'])
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    jest.spyOn(Math, 'random').mockReturnValue(0.99) // the last one

    new PullCardTask().execute(gs, ctx, em, stubRm)

    expect(gs.getPlayer('p1')!.getHand()).toEqual(['c'])
  })

  it('reads whichever slot it was told to', () => {
    const { gs, ctx, em } = setup(['a'])
    ctx.set('someOtherSlot', ['p2'])

    new PullCardTask('someOtherSlot').execute(gs, ctx, em, stubRm)

    expect(gs.getPlayer('p1')!.getHand()).toEqual(['a'])
  })

  it('THROWS when nothing was declared to supply a player', () => {
    const { gs, ctx, em } = setup(['a'])

    expect(() => new PullCardTask().execute(gs, ctx, em, stubRm)).toThrow(
      /nothing has written/,
    )
  })

  it('an empty hand produces nothing, and says so', () => {
    const { gs, ctx, em, events } = setup([])
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])

    new PullCardTask().execute(gs, ctx, em, stubRm)

    // "Ran and produced nothing", not "never ran": the steps behind it skip.
    expect(ctx.get(CTX_PULLED_CARD_IDS)).toEqual([])
    expect(events.map((e) => e.getType())).not.toContain(
      GameEventType.CardPulled,
    )
  })

  it('an empty CHOICE produces nothing either', () => {
    const { gs, ctx, em } = setup(['a'])
    ctx.set(CTX_CHOSEN_PLAYER, [])

    new PullCardTask().execute(gs, ctx, em, stubRm)

    expect(ctx.get(CTX_PULLED_CARD_IDS)).toEqual([])
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['a'])
  })

  it('refuses to pull from yourself', () => {
    const { gs, ctx, em } = setup(['a'], ['own'])
    ctx.set(CTX_CHOSEN_PLAYER, ['p1'])

    new PullCardTask().execute(gs, ctx, em, stubRm)

    expect(ctx.get(CTX_PULLED_CARD_IDS)).toEqual([])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['own'])
  })
})

// --- ForEachPlayerTask helpers: seats with typed heroes, and the announcements ---
const seatWithHeroes = (gs: GameState, id: string, heroes: { id: string; cls: HeroClass }[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand: [], partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(
    new Party({ playerId: id, leaderId: `${id}-leader`, heroIds: heroes.map((h) => h.id), monsterIds: [] }),
  )
  for (const hero of heroes) {
    gs.registerCard(
      new HeroCard({
        id: hero.id,
        name: hero.id,
        type: CardType.Hero,
        image: '',
        description: '',
        set: 'base',
        heroClass: hero.cls,
        rollReq: 5,
      }),
    )
  }
}

const targeted = (emitted: IGameEvent[]) =>
  emitted
    .filter((e) => e.getType() === GameEventType.PlayerTargeted)
    .map((e) => e.getPayload() as { cardId: string; label: string; ctxSeed: Record<string, unknown> })

const collectFrom = () => {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  return { em, emitted }
}
describe('ForEachPlayerTask', () => {
  it('announces one PlayerTargeted per other seat, carrying that seat and the label', () => {
    const gs = makeGs()
    seatWithHeroes(gs, 'p1')
    seatWithHeroes(gs, 'p2')
    seatWithHeroes(gs, 'p3')
    const { em, emitted } = collectFrom()

    new ForEachPlayerTask({ owner: Owner.Others }, 'Pay').execute(
      gs,
      new AbilityContext('hero-035', 'p1'),
      em,
      stubRm,
    )

    const hits = targeted(emitted)
    expect(hits).toHaveLength(2)
    for (const hit of hits) {
      expect(hit.cardId).toBe('hero-035') // SelfCard matches the acting card
      expect(hit.label).toBe('Pay')
    }
    // Reverse order, so the runs they start (a stack) resolve in seat order.
    expect(hits.map((h) => h.ctxSeed[CTX_CHOSEN_PLAYER])).toEqual([['p3'], ['p2']])
  })

  it('honours the player filter — only seats with a Fighter standing', () => {
    const gs = makeGs()
    seatWithHeroes(gs, 'p1')
    seatWithHeroes(gs, 'p2', [{ id: 'f', cls: HeroClass.Fighter }])
    seatWithHeroes(gs, 'p3', [{ id: 'w', cls: HeroClass.Wizard }])
    const { em, emitted } = collectFrom()

    new ForEachPlayerTask({ owner: Owner.Others, hasClass: HeroClass.Fighter }, 'Pay').execute(
      gs,
      new AbilityContext('hero-006', 'p1'),
      em,
      stubRm,
    )

    expect(targeted(emitted).map((h) => h.ctxSeed[CTX_CHOSEN_PLAYER])).toEqual([['p2']])
  })

  it('announces nothing when no seat qualifies', () => {
    const gs = makeGs()
    seatWithHeroes(gs, 'p1')
    const { em, emitted } = collectFrom()

    new ForEachPlayerTask({ owner: Owner.Others }, 'Pay').execute(
      gs,
      new AbilityContext('hero-035', 'p1'),
      em,
      stubRm,
    )

    expect(emitted).toEqual([])
  })
})

describe('RevealTask', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("shows the chosen player's hand to the OWNER only, then takes it off when the clock runs out", () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerPlayer(makePlayer('p2', ['a', 'b']))
    const ctx = makeCtx('hero-016', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    const { emitter, emitted } = makeEmitter()

    new RevealTask({ filter: { zone: Zone.Hand, owner: Owner.Chosen }, to: 'owner' }).execute(gs, ctx, emitter, stubRm)

    expect(gs.getRevealed('p1')).toEqual(['a', 'b'])
    expect(gs.getRevealed('p2')).toEqual([])
    expect(emitted.map((e) => e.getType())).toEqual([GameEventType.CardsRevealed])
    expect(emitted[0].getPayload()).toMatchObject({ cardIds: ['a', 'b'], toAll: false })

    jest.advanceTimersByTime(REVEAL_MS)
    expect(gs.getRevealed('p1')).toEqual([])
    expect(emitted.map((e) => e.getType())).toEqual([GameEventType.CardsRevealed, GameEventType.RevealEnded])
  })

  it("to: 'all' shows every seat the cards in a slot", () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerPlayer(makePlayer('p2'))
    const ctx = makeCtx('hero-008', 'p1')
    ctx.set(CTX_DRAWN_CARD_IDS, ['drawn'])
    const { emitter } = makeEmitter()

    new RevealTask({ fromKey: CTX_DRAWN_CARD_IDS, to: 'all' }).execute(gs, ctx, emitter, stubRm)

    expect(gs.getRevealed('p1')).toEqual(['drawn'])
    expect(gs.getRevealed('p2')).toEqual(['drawn'])
  })

  it('shows nothing, and starts no clock, for an empty slot', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    const ctx = makeCtx()
    ctx.set(CTX_DRAWN_CARD_IDS, [])
    const { emitter, emitted } = makeEmitter()

    new RevealTask({ fromKey: CTX_DRAWN_CARD_IDS, to: 'owner' }).execute(gs, ctx, emitter, stubRm)

    expect(emitted).toEqual([])
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('DrawTask — a named card', () => {
  it('draws the card the slot names out of wherever it lies in the deck, announced as a draw', () => {
    const gs = makeGs(['t1', 't2', 't3'])
    gs.registerPlayer(makePlayer('p1'))
    const ctx = makeCtx()
    ctx.set(CTX_CHOSEN_CARD, ['t2'])
    const { emitter, emitted } = makeEmitter()

    new DrawTask(CTX_CHOSEN_CARD).execute(gs, ctx, emitter, stubRm)

    expect(gs.getPlayer('p1')!.getHand()).toEqual(['t2'])
    expect(gs.peekMainDeck(2)).toEqual(['t1', 't3'])
    expect(ctx.get(CTX_DRAWN_CARD_IDS)).toEqual(['t2'])
    expect(emitted.map((e) => e.getType())).toEqual([GameEventType.CardDrawn])
  })

  it('draws nothing for a named card that is not in the deck', () => {
    const gs = makeGs(['t1'])
    gs.registerPlayer(makePlayer('p1', ['mine']))
    const ctx = makeCtx()
    ctx.set(CTX_CHOSEN_CARD, ['mine'])
    const { emitter, emitted } = makeEmitter()

    new DrawTask(CTX_CHOSEN_CARD).execute(gs, ctx, emitter, stubRm)

    expect(ctx.get(CTX_DRAWN_CARD_IDS)).toEqual([])
    expect(emitted).toEqual([])
  })
})

describe('DiscardTask — says what it discarded', () => {
  it('writes the discarded card, or nothing when the player picked nothing', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', ['a']))
    const ctx = makeCtx()
    const { emitter } = makeEmitter()
    ctx.set(CTX_CHOSEN_CARD, ['a'])
    new DiscardTask().execute(gs, ctx, emitter, stubRm)
    expect(ctx.get(CTX_DISCARDED_CARDS)).toEqual(['a'])
    ctx.set(CTX_CHOSEN_CARD, [])
    new DiscardTask().execute(gs, ctx, emitter, stubRm)
    expect(ctx.get(CTX_DISCARDED_CARDS)).toEqual([])
  })
})

describe('MarkDiscardPileTask / DiscardedCountTask', () => {
  it('counts what landed on the pile since the mark', () => {
    const gs = makeGs()
    gs.getDiscardPile().add('old')
    const ctx = makeCtx()
    const { emitter } = makeEmitter()
    new MarkDiscardPileTask().execute(gs, ctx, emitter, stubRm)
    expect(ctx.get(CTX_DISCARD_PILE_MARK)).toBe(1)
    gs.addToDiscardPile('x')
    gs.addToDiscardPile('y')
    new DiscardedCountTask().execute(gs, ctx, emitter, stubRm)
    expect(ctx.get(CTX_DISCARDED_COUNT)).toBe(2)
  })

  it('a count without a mark is a mis-declared ability', () => {
    const { emitter } = makeEmitter()
    expect(() => new DiscardedCountTask().execute(makeGs(), makeCtx(), emitter, stubRm)).toThrow(/mark/)
  })
})

describe('TradeHandsTask', () => {
  it('swaps the owner\'s hand with the chosen seat\'s, announced once as HandsTraded', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', ['a', 'b']))
    gs.registerPlayer(makePlayer('p2', ['x']))
    const ctx = makeCtx()
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    const { emitter, emitted } = makeEmitter()
    new TradeHandsTask().execute(gs, ctx, emitter, stubRm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['x'])
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['a', 'b'])
    expect(emitted.map((e) => e.getType())).toEqual([GameEventType.HandsTraded])
  })

  it('nobody chosen, or yourself: nothing moves', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', ['a']))
    const ctx = makeCtx()
    const { emitter, emitted } = makeEmitter()
    ctx.set(CTX_CHOSEN_PLAYER, [])
    new TradeHandsTask().execute(gs, ctx, emitter, stubRm)
    ctx.set(CTX_CHOSEN_PLAYER, ['p1'])
    new TradeHandsTask().execute(gs, ctx, emitter, stubRm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['a'])
    expect(emitted).toEqual([])
  })

  it('throws when no step ahead named a seat', () => {
    const { emitter } = makeEmitter()
    expect(() => new TradeHandsTask().execute(makeGs(), makeCtx(), emitter, stubRm)).toThrow(/ChoosePlayerTask/)
  })
})

