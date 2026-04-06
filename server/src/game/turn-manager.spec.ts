import { ActionType, GameEventType, IGameEvent, TurnPhase } from 'shared'
import { TurnManager } from './turn-manager'
import { GameState } from './game-state'
import { GameEventEmitter } from './events/game-event-emitter'
import { Player } from './player'
import { Party } from './party'
import { CardStack } from './card-stack'
import { IAction } from './interfaces'
import { GameEvent } from './events/game-event'
import { Audience } from 'shared'

const makeGs = (actionPoints = 3) => {
  const deck = new CardStack('deck', 'main')
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [],
    partyId: 'party-1',
    actionPoints,
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

/**
 * Realistic mock action: canExecute checks player AP, execute deducts it.
 * This mirrors how real actions behave so TurnManager tests stay accurate.
 */
const makeAction = (
  cost: number,
  canExecBase = true,
  events: IGameEvent[] = [],
): IAction => ({
  getId: () => 'test-action',
  getType: () => ActionType.DrawCard,
  getPlayerId: () => 'p1',
  getCost: () => cost,
  isChallengeable: () => false,
  canExecute: (gs: GameState) => {
    if (!canExecBase) return false
    const player = gs.getPlayer('p1')
    return !!player && player.getActionPoints() >= cost
  },
  execute: (gs: GameState) => {
    gs.getPlayer('p1')?.decreaseActionPoints(cost)
    return events
  },
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

    it('should reset action points from player', () => {
      const gs = makeGs(3)
      // Simulate previous turn spending
      gs.getPlayer('p1')!.decreaseActionPoints(2)
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
      const executed: boolean[] = []
      const action = makeAction(1)
      action.execute = () => {
        executed.push(true)
        return []
      }
      tm.enqueue(action) // phase is TurnStart — ignored
      expect(executed).toHaveLength(0)
    })

    it('should execute a valid action', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      const executed: boolean[] = []
      const action = makeAction(1)
      action.execute = (g) => {
        gs.getPlayer('p1')?.decreaseActionPoints(1)
        executed.push(true)
        return []
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

    it('should skip actions when canExecute returns false (e.g. cost exceeds AP)', () => {
      const gs = makeGs(1)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      // cost-2 action → canExecute checks player AP (1) < 2 → returns false → skipped
      const executed: boolean[] = []
      const expensive = makeAction(2)
      const origExecute = expensive.execute
      expensive.execute = (g) => {
        executed.push(true)
        return origExecute(g)
      }
      tm.enqueue(expensive)
      expect(executed).toHaveLength(0)
      expect(tm.getPhase()).toBe(TurnPhase.ActionWindow) // turn not ended, just skipped
      expect(tm.getActionPoints()).toBe(1)
    })

    it('should skip actions whose canExecute explicitly returns false', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      const executed: boolean[] = []
      const blocked = makeAction(1, false)
      blocked.execute = () => {
        executed.push(true)
        return []
      }
      tm.enqueue(blocked)
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

    it('should pause drain when a reaction window is open', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')

      // Action that opens a fake window as a side-effect
      const executed: string[] = []
      const windowAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          executed.push('window-action')
          // Simulate opening a window
          g.addReactionWindow({
            getType: () => require('shared').ReactionWindowType.Modifier,
            isOpen: () => true,
          })
          return []
        },
      }
      const afterAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          executed.push('after-action')
          return []
        },
      }

      tm.enqueue(windowAction)
      tm.enqueue(afterAction)

      // window-action ran, afterAction was paused
      expect(executed).toEqual(['window-action'])
      expect(tm.getPhase()).toBe(TurnPhase.ActionWindow)
    })

    it('should resume drain after resumeDrain() is called', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')

      const executed: string[] = []
      let windowRef: any

      const windowAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          windowRef = {
            getType: () => require('shared').ReactionWindowType.Modifier,
            isOpen: () => true,
          }
          g.addReactionWindow(windowRef)
          executed.push('window-action')
          return []
        },
      }
      const afterAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          executed.push('after-action')
          return []
        },
      }

      tm.enqueue(windowAction)
      tm.enqueue(afterAction)
      expect(executed).toEqual(['window-action'])

      // Close the window and resume
      gs.removeReactionWindow(windowRef)
      tm.resumeDrain()
      expect(executed).toEqual(['window-action', 'after-action'])
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
      tm.enqueue(makeAction(1)) // costs last point → auto-endTurn
      expect(tm.getPhase()).toBe(TurnPhase.TurnEnd)
      expect(
        received.some((e) => e.getType() === GameEventType.TurnEnded),
      ).toBe(true)
    })

    it('should NOT auto-end when AP=0 but a reaction window is still open', () => {
      const gs = makeGs(1)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')

      const windowAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          g.addReactionWindow({
            getType: () => require('shared').ReactionWindowType.Modifier,
            isOpen: () => true,
          })
          return []
        },
      }
      tm.enqueue(windowAction)
      // AP is 0 but window is open — turn should NOT have ended
      expect(tm.getPhase()).toBe(TurnPhase.ActionWindow)
    })
  })
})
