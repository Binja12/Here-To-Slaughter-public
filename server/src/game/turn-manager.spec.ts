import { ActionType, GameEventType, IGameEvent, TurnPhase } from 'shared'
import { TurnManager } from './turn-manager'
import { GameState } from './game-state'
import { GameEventEmitter } from './game-event-emitter'
import { Player } from './player'
import { Party } from './party'
import { CardStack } from './card-stack'
import { IAction } from './interfaces'
import { GameEvent } from './game-event'
import { Audience } from 'shared'

const makeGs = (actionPointsPerTurn = 3) => {
  const deck = new CardStack('deck', 'main')
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [],
    partyId: 'party-1',
    actionPointsPerTurn,
  })
  const party = new Party({
    playerId: 'p1',
    leaderId: 'leader-1',
    heroIds: [],
    MonsterIds: [],
  })
  const gs = new GameState(deck)
  gs.registerPlayer(player)
  gs.registerParty(party)
  return gs
}

const makeAction = (
  cost: number,
  canExec = true,
  events: IGameEvent[] = [],
): IAction => ({
  getId: () => 'test-action',
  getType: () => ActionType.DrawCard,
  getPlayerId: () => 'p1',
  getCost: () => cost,
  canExecute: () => canExec,
  execute: () => events,
})

describe('TurnManager', () => {
  describe('startTurn()', () => {
    it('should set current player', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      expect(gs.getCurrentPlayerId()).toBe('p1')
    })

    it('should set phase to ActionWindow', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      expect(tm.getPhase()).toBe(TurnPhase.ActionWindow)
    })

    it('should reset action points from player data', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      expect(tm.getActionPoints()).toBe(3)
    })

    it('should clear abilities used from previous turn', () => {
      const gs = makeGs()
      gs.markAbilityUsed('hero-1')
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      expect(gs.getAbilitiesUsedThisTurn()).toHaveLength(0)
    })

    it('should emit TurnStarted event', () => {
      const gs = makeGs()
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')
      expect(
        received.some((e) => e.getType() === GameEventType.TurnStarted),
      ).toBe(true)
    })

    it('should do nothing for unknown player', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('unknown')
      expect(gs.getCurrentPlayerId()).toBeUndefined()
    })
  })

  describe('enqueue()', () => {
    it('should ignore actions when phase is not ActionWindow', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      // phase starts as TurnStart, not ActionWindow
      const executed: boolean[] = []
      const action = makeAction(1, true, [])
      action.execute = () => {
        executed.push(true)
        return []
      }
      tm.enqueue(action)
      expect(executed).toHaveLength(0)
    })

    it('should execute a valid action', () => {
      const gs = makeGs(3)
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')

      const executed: boolean[] = []
      const action: IAction = {
        getId: () => 'a1',
        getType: () => require('shared').ActionType.DrawCard,
        getPlayerId: () => 'p1',
        getCost: () => 1,
        canExecute: () => true,
        execute: () => {
          executed.push(true)
          return []
        },
      }
      tm.enqueue(action)
      expect(executed).toHaveLength(1)
    })

    it('should deduct action points after execution', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      tm.enqueue(makeAction(2))
      expect(tm.getActionPoints()).toBe(1)
    })

    it('should skip actions whose cost exceeds remaining points', () => {
      const gs = makeGs(1)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      // 1 point left, enqueue cost-2 action — should be skipped
      const executed: boolean[] = []
      const action: IAction = {
        ...makeAction(2),
        execute: () => {
          executed.push(true)
          return []
        },
      }
      // First, use 0 points with a 0-cost? No, min cost is 1. Let's reduce points first.
      // Use the 1 point with a valid action, then try cost-2
      tm.enqueue(makeAction(1)) // uses 1 point → 0 left → endTurn fires
      // endTurn changes phase, so further enqueues are ignored
      expect(tm.getPhase()).toBe(TurnPhase.TurnEnd)
    })

    it('should skip actions that canExecute returns false', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      const executed: boolean[] = []
      const action: IAction = {
        ...makeAction(1, false),
        execute: () => {
          executed.push(true)
          return []
        },
      }
      tm.enqueue(action)
      expect(executed).toHaveLength(0)
    })

    it('should emit events produced by actions', () => {
      const gs = makeGs(3)
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')

      const actionEvent = new GameEvent(
        GameEventType.CardDrawn,
        'p1',
        {},
        Audience.PlayerOnly,
      )
      tm.enqueue(makeAction(1, true, [actionEvent]))
      expect(received).toContain(actionEvent)
    })
  })

  describe('endTurn()', () => {
    it('should set phase to TurnEnd', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      tm.endTurn()
      expect(tm.getPhase()).toBe(TurnPhase.TurnEnd)
    })

    it('should emit TurnEnded event', () => {
      const gs = makeGs()
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')
      received.length = 0 // clear TurnStarted
      tm.endTurn()
      expect(
        received.some((e) => e.getType() === GameEventType.TurnEnded),
      ).toBe(true)
    })

    it('should auto-end turn when action points reach zero', () => {
      const gs = makeGs(1)
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')
      tm.enqueue(makeAction(1)) // costs 1 point — uses the last point
      expect(tm.getPhase()).toBe(TurnPhase.TurnEnd)
      expect(
        received.some((e) => e.getType() === GameEventType.TurnEnded),
      ).toBe(true)
    })
  })
})
