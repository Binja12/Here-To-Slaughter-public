import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
} from 'shared'
import { CriticalBoostAbility } from './critical-boost-ability'
import { SnowballAbility } from './snowball-ability'
import { GameState } from '../pipelines/game-state'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import { IAbility, IReactionWindow } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { ReactionManager } from '../pipelines/reaction-manager'
import { TaskManager } from '../pipelines/task-manager'
import { PlayMagicAction } from '../actions/play-magic-action'
import { CONFIRM } from '../reactions/task-choice-window'

// ---------------------------------------------------------------------------
// Critical Boost (magic-053) — "DRAW 3 cards and DISCARD a card."
// ---------------------------------------------------------------------------

const BOOST = 'magic-053'

const makeMagic = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'base',
  })

const makeHero = (id: string) =>
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

function setup(deck: string[], hand: string[] = [], heroIds: string[] = []) {
  const stack = new CardStack('deck', 'main')
  for (const c of deck) stack.addToBottom(c)
  const gs = new GameState(
    stack,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [...hand],
    partyId: 'party-1',
    actionPoints: 3,
  })
  gs.registerPlayer(player)
  gs.registerParty(
    new Party({ playerId: 'p1', leaderId: 'leader-1', heroIds, monsterIds: [] }),
  )
  gs.setCurrentPlayerId('p1')
  for (const id of [...deck, ...hand]) gs.registerCard(makeMagic(id))

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  return { gs, player, em, rm, events }
}

const openWindow = (gs: GameState): IReactionWindow | undefined =>
  [...gs.frames.values()].flatMap((f) => f.windows).find((w) => w.isOpen())

const drawnCount = (events: IGameEvent[]) =>
  events.filter((e) => e.getType() === GameEventType.CardDrawn).length

describe('CriticalBoostAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  /** Plays the card as a normal player action, the everyday route. */
  function play(deck: string[], hand: string[] = []) {
    const ctx = setup(deck, [BOOST, ...hand])
    new TaskManager(
      ctx.gs,
      ctx.em,
      ctx.rm,
      new Map([[BOOST, CriticalBoostAbility]]),
    )
    new PlayMagicAction('a1', 'p1', BOOST, ctx.rm, ctx.em).execute(ctx.gs)
    // Nobody challenges: the window times out and the play goes through.
    jest.advanceTimersByTime(5000)
    return ctx
  }

  it('is one entry — the pause is a step, not a continuation', () => {
    // Nothing forces the split: a choice window suspends the pipeline in
    // place, so the discard is a later STEP of the same run. (A played card
    // now holds its instance-pile position until its ability is done, so a
    // continuation entry WOULD match — this card simply does not need one.)
    expect(CriticalBoostAbility).toHaveLength(1)
    expect(CriticalBoostAbility[0].trigger.on).toBe(
      GameEventType.FrameResolved,
    )
  })

  it('draws three cards, then asks which one to lose', () => {
    const { gs, player, events } = play(['a', 'b', 'c'])

    expect(drawnCount(events)).toBe(3)
    expect(player.getHand()).toEqual(['a', 'b', 'c'])
    expect(openWindow(gs)?.getType()).toBe(ReactionWindowType.CardChoice)
  })

  it('offers the freshly drawn cards — the draw happens first', () => {
    const { gs, events } = play(['a', 'b', 'c'])

    // The challenge window opened first; this is the ability's own.
    const opened = events.find(
      (e) =>
        e.getType() === GameEventType.ReactionWindowOpened &&
        (e.getPayload() as { windowType: ReactionWindowType }).windowType ===
          ReactionWindowType.CardChoice,
    )!
    const { options } = opened.getPayload() as { options: string[] }
    expect(options).toEqual(expect.arrayContaining(['a', 'b', 'c']))
    // Never itself: it left the hand when it was played.
    expect(options).not.toContain(BOOST)
    // Still in the instance pile — a played card is disposed of only once its
    // ability has finished.
    expect(gs.getParty('p1').getInstanceCardIds()).toContain(BOOST)
    expect(gs.getDiscardPile().getAll()).not.toContain(BOOST)
  })

  it('discards the card the player picks', () => {
    const { gs, player } = play(['a', 'b', 'c'])

    openWindow(gs)!.submitReaction('p1', { choice: 'b' })

    expect(player.getHand()).toEqual(['a', 'c'])
    expect(gs.getDiscardPile().getAll()).toContain('b')
  })

  it('emits CardDiscarded for the pick', () => {
    const { gs, events } = play(['a', 'b', 'c'])

    openWindow(gs)!.submitReaction('p1', { choice: 'b' })

    const discards = events.filter(
      (e) => e.getType() === GameEventType.CardDiscarded,
    )
    // Only the pick: disposing of the played card itself is silent.
    expect(discards).toHaveLength(1)
    expect((discards[0].getPayload() as { cardId: string }).cardId).toBe('b')
  })

  it('still pays the discard when the player never answers', () => {
    const { gs, player } = play(['a', 'b', 'c'])

    jest.advanceTimersByTime(5000)

    // A timeout resolves rather than rolling back, and a card choice defaults
    // to a random one of the options — so the cost lands either way.
    expect(player.getHand()).toHaveLength(2)
    const [gone] = ['a', 'b', 'c'].filter((c) => !player.getHand().includes(c))
    expect(gs.getDiscardPile().getAll()).toContain(gone)
    expect(gs.abilityPipelines).toHaveLength(0)
  })

  it('may take a card that was already in hand', () => {
    const { gs, player } = play(['a', 'b', 'c'], ['old-card'])

    openWindow(gs)!.submitReaction('p1', { choice: 'old-card' })

    expect(player.getHand()).toEqual(['a', 'b', 'c'])
    expect(gs.getDiscardPile().getAll()).toContain('old-card')
  })

  it('draws what it can when the deck runs short, and still asks', () => {
    const { gs, player, events } = play(['a'])

    expect(drawnCount(events)).toBe(1)
    expect(openWindow(gs)).toBeDefined()

    openWindow(gs)!.submitReaction('p1', { choice: 'a' })

    expect(player.getHand()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Snowball draws Critical Boost and plays it — two abilities, one stack.
// ---------------------------------------------------------------------------

describe('Snowball drawing Critical Boost', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  /** Snowball rolls, draws the Boost, and the player says yes to playing it. */
  function rollSnowball() {
    // snowball draws BOOST; BOOST draws a,b,c; snowball's second draw is 'd'.
    const ctx = setup([BOOST, 'a', 'b', 'c', 'd'], [], ['snowball'])
    ctx.gs.registerCard(makeHero('snowball'))
    new TaskManager(
      ctx.gs,
      ctx.em,
      ctx.rm,
      new Map<string, IAbility[]>([
        ['snowball', SnowballAbility],
        [BOOST, CriticalBoostAbility],
      ]),
    )
    ctx.em.emit(GameEventFactory.rollSuccess('p1', 'snowball'))
    // Snowball's prompt: yes, play it and draw.
    openWindow(ctx.gs)!.submitReaction('p1', { choice: CONFIRM })
    // Then the challenge on the Boost itself, uncontested.
    jest.advanceTimersByTime(5000)
    return ctx
  }

  it('offers the Boost, because a drawn Magic card is playable', () => {
    const ctx = setup([BOOST, 'a'], [], ['snowball'])
    ctx.gs.registerCard(makeHero('snowball'))
    new TaskManager(
      ctx.gs,
      ctx.em,
      ctx.rm,
      new Map<string, IAbility[]>([['snowball', SnowballAbility]]),
    )

    ctx.em.emit(GameEventFactory.rollSuccess('p1', 'snowball'))

    expect(ctx.player.getHand()).toEqual([BOOST])
    expect(openWindow(ctx.gs)?.getType()).toBe(ReactionWindowType.TaskChoice)
  })

  it("runs the Boost's own ability once Snowball plays it", () => {
    const { gs, player, events } = rollSnowball()

    // Snowball's draw, then the Boost's three.
    expect(drawnCount(events)).toBe(4)
    expect(player.getHand()).toEqual(['a', 'b', 'c'])
    // Held until its own ability is done.
    expect(gs.getParty('p1').getInstanceCardIds()).toContain(BOOST)
    expect(openWindow(gs)?.getType()).toBe(ReactionWindowType.CardChoice)
  })

  it("holds Snowball's second draw until the Boost is finished", () => {
    const { gs, player, events } = rollSnowball()

    // The Boost's question is open and Snowball's second draw waits under it.
    expect(drawnCount(events)).toBe(4)

    openWindow(gs)!.submitReaction('p1', { choice: 'b' })

    // Now the discard, then Snowball's second draw.
    expect(drawnCount(events)).toBe(5)
    expect(player.getHand()).toEqual(['a', 'c', 'd'])
    expect(gs.getDiscardPile().getAll()).toContain('b')
    // And only now is the Boost itself disposed of.
    expect(gs.getParty('p1').getInstanceCardIds()).not.toContain(BOOST)
    expect(gs.getDiscardPile().getAll()).toContain(BOOST)
  })

  it('leaves nothing pending once both abilities are done', () => {
    const { gs } = rollSnowball()

    openWindow(gs)!.submitReaction('p1', { choice: 'b' })

    expect(gs.abilityPipelines).toHaveLength(0)
    expect(gs.frames.size).toBe(0)
  })

  it('still finishes Snowball when the Boost prompt times out', () => {
    const { gs, player, events } = rollSnowball()

    jest.advanceTimersByTime(5000)

    // The idle discard is taken from the Boost's own options, and Snowball's
    // second draw is not lost with it.
    expect(drawnCount(events)).toBe(5)
    expect(player.getHand()).toHaveLength(3)
    expect(player.getHand()).toContain('d')
    expect(gs.abilityPipelines).toHaveLength(0)
  })
})
