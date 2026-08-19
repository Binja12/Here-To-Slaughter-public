import { GameEventType, IGameEvent } from 'shared'
import { GameEngine } from './game-engine'
import { GameState } from './pipelines/game-state'
import { TurnManager } from './pipelines/turn-manager'
import { GameEventEmitter } from './events/game-event-emitter'
import { Player } from './state-structures/player'
import { Party } from './state-structures/party'
import { CardStack } from './state-structures/card-stack'
import { CardPile } from './state-structures/card-pile'
import { IWinCondition } from './interfaces'

const makePlayer = (id: string, points = 3) =>
  new Player({
    id,
    name: id,
    hand: [],
    partyId: `party-${id}`,
    actionPoints: points,
  })

const makeParty = (playerId: string) =>
  new Party({
    playerId,
    leaderId: `leader-${playerId}`,
    heroIds: [],
    monsterIds: [],
  })

const makeGs = (...playerIds: string[]) => {
  const deck = new CardStack('deck', 'main')
  const gs = new GameState(
    deck,
    new CardPile('discard', 'discard-pile'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  for (const id of playerIds) {
    gs.registerPlayer(makePlayer(id))
    gs.registerParty(makeParty(id))
  }
  return gs
}

describe('GameEngine', () => {
  describe('start()', () => {
    it('should start the first player turn', () => {
      const gs = makeGs('p1', 'p2')
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const engine = new GameEngine(gs, tm, emitter)

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      engine.start(['p1', 'p2'])

      expect(
        received.some(
          (e) =>
            e.getType() === GameEventType.TurnStarted &&
            e.getPlayerId() === 'p1',
        ),
      ).toBe(true)
    })

    it('should do nothing for empty player order', () => {
      const gs = makeGs()
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const engine = new GameEngine(gs, tm, emitter)
      expect(() => engine.start([])).not.toThrow()
    })
  })

  describe('turn rotation', () => {
    it('should start next player turn after TurnEnded', () => {
      const gs = makeGs('p1', 'p2')
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const engine = new GameEngine(gs, tm, emitter)

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      engine.start(['p1', 'p2'])
      // p1 has 3 action points; endTurn() is called manually to simulate end
      tm.endTurn()

      const turnStarts = received.filter(
        (e) => e.getType() === GameEventType.TurnStarted,
      )
      expect(turnStarts.some((e) => e.getPlayerId() === 'p2')).toBe(true)
    })

    it('should wrap around to the first player after the last', () => {
      const gs = makeGs('p1', 'p2')
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const engine = new GameEngine(gs, tm, emitter)
      engine.start(['p1', 'p2'])
      tm.endTurn() // p1 ends → p2 starts
      tm.endTurn() // p2 ends → p1 starts again

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      // Current player should be p1 again
      expect(gs.getCurrentPlayerId()).toBe('p1')
    })
  })

  describe('win conditions', () => {
    it('should emit GameEnded when a win condition is met', () => {
      const gs = makeGs('p1')
      const player = gs.getPlayer('p1')!
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)

      const winCondition: IWinCondition = { check: () => player }
      const engine = new GameEngine(gs, tm, emitter, [winCondition])

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      engine.start(['p1'])
      tm.endTurn()

      expect(
        received.some((e) => e.getType() === GameEventType.GameEnded),
      ).toBe(true)
    })

    it('should not start next turn after game ends', () => {
      const gs = makeGs('p1', 'p2')
      const player = gs.getPlayer('p1')!
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const winCondition: IWinCondition = { check: () => player }
      const engine = new GameEngine(gs, tm, emitter, [winCondition])

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      engine.start(['p1', 'p2'])
      tm.endTurn()

      const turnStarts = received.filter(
        (e) => e.getType() === GameEventType.TurnStarted,
      )
      // Only p1's initial turn start, no p2 start
      expect(turnStarts.every((e) => e.getPlayerId() === 'p1')).toBe(true)
    })
  })
})
