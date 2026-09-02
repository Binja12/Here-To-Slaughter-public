import { GameEventType, IGameEvent } from 'shared'
import { RedrawHandTask } from './redraw-hand-task'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { AbilityContext } from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ReactionManager } from '../pipelines/reaction-manager'

const makeGs = (deck: string[]) => {
  const stack = new CardStack('deck', 'main')
  for (const id of deck) stack.addToBottom(id)
  return new GameState(
    stack,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
}

const makePlayer = (id: string, hand: string[]) =>
  new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 })

const makeEmitter = () => {
  const emitter = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  emitter.addListener({ onEvent: (e) => emitted.push(e) })
  return { emitter, emitted }
}

const ofType = (events: IGameEvent[], type: GameEventType) =>
  events.filter((e) => e.getType() === type)

const run = (gs: GameState, ownerId: string, emitter: GameEventEmitter) =>
  new RedrawHandTask().execute(
    gs,
    new AbilityContext('src', ownerId),
    emitter,
    new ReactionManager(gs, emitter),
  )

describe('RedrawHandTask', () => {
  it('discards the whole hand, then draws five, one announcement each', () => {
    const gs = makeGs(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'])
    const player = makePlayer('p1', ['h1', 'h2', 'h3'])
    gs.registerPlayer(player)
    const { emitter, emitted } = makeEmitter()

    run(gs, 'p1', emitter)

    expect(player.getHand()).toEqual(['d1', 'd2', 'd3', 'd4', 'd5'])
    expect(gs.getDiscardPile().getAll().sort()).toEqual(['h1', 'h2', 'h3'])
    expect(gs.getMainDeck().getSize()).toBe(1)
    expect(ofType(emitted, GameEventType.CardDiscarded)).toHaveLength(3)
    expect(ofType(emitted, GameEventType.CardDrawn)).toHaveLength(5)
  })

  it('announces every discard before the first draw — printed order', () => {
    const gs = makeGs(['d1', 'd2', 'd3', 'd4', 'd5'])
    gs.registerPlayer(makePlayer('p1', ['h1', 'h2']))
    const { emitter, emitted } = makeEmitter()

    run(gs, 'p1', emitter)

    const order = emitted
      .map((e) => e.getType())
      .filter(
        (t) => t === GameEventType.CardDiscarded || t === GameEventType.CardDrawn,
      )
    expect(order).toEqual([
      GameEventType.CardDiscarded,
      GameEventType.CardDiscarded,
      GameEventType.CardDrawn,
      GameEventType.CardDrawn,
      GameEventType.CardDrawn,
      GameEventType.CardDrawn,
      GameEventType.CardDrawn,
    ])
    expect(ofType(emitted, GameEventType.CardDiscarded)[0].getPlayerId()).toBe(
      'p1',
    )
  })

  it('an empty hand discards nothing and still draws five', () => {
    const gs = makeGs(['d1', 'd2', 'd3', 'd4', 'd5'])
    const player = makePlayer('p1', [])
    gs.registerPlayer(player)
    const { emitter, emitted } = makeEmitter()

    run(gs, 'p1', emitter)

    expect(player.getHand()).toHaveLength(5)
    expect(ofType(emitted, GameEventType.CardDiscarded)).toEqual([])
  })

  it('a short deck refills from the hand it just discarded', () => {
    // Two in the deck, three in hand: the second draw empties the deck and
    // the three discards come back in behind it.
    const gs = makeGs(['d1', 'd2'])
    const player = makePlayer('p1', ['h1', 'h2', 'h3'])
    gs.registerPlayer(player)
    const { emitter, emitted } = makeEmitter()

    run(gs, 'p1', emitter)

    expect(player.getHand()).toHaveLength(5)
    expect(player.getHand().sort()).toEqual(['d1', 'd2', 'h1', 'h2', 'h3'])
    expect(gs.getDiscardPile().getSize()).toBe(0)
    expect(gs.getMainDeck().getSize()).toBe(0)
    expect(ofType(emitted, GameEventType.CardDrawn)).toHaveLength(5)
  })

  it('draws what there is when deck and discard both run out', () => {
    const gs = makeGs(['d1'])
    const player = makePlayer('p1', ['h1'])
    gs.registerPlayer(player)
    const { emitter, emitted } = makeEmitter()

    run(gs, 'p1', emitter)

    expect(player.getHand().sort()).toEqual(['d1', 'h1'])
    expect(ofType(emitted, GameEventType.CardDrawn)).toHaveLength(2)
  })

  it('does nothing for an owner who is not seated', () => {
    const gs = makeGs(['d1'])
    const { emitter, emitted } = makeEmitter()

    run(gs, 'nobody', emitter)

    expect(emitted).toEqual([])
    expect(gs.getMainDeck().getSize()).toBe(1)
  })
})
