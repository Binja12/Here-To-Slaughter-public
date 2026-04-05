import { IGameEvent, IGameEventListener, GameEventType, Audience } from 'shared'
import { AbilityProcessor } from './ability-processor'
import { GameState } from './game-state'
import { CardStack } from './card-stack'
import { AbilityContext } from './ability-context'
import { IAbility, IPassive, ITask } from './interfaces'
import { GameEvent } from './game-event'
import { GameEventEmitter } from './game-event-emitter'

const makeGs = () => new GameState(new CardStack('deck', 'main'))

const makeTask = (events: IGameEvent[]): ITask => ({
  execute: () => events,
})

const makeDiceRolledEvent = () =>
  new GameEvent(GameEventType.DiceRolled, 'p1', {}, Audience.All)

describe('AbilityProcessor', () => {
  describe('process()', () => {
    it('should return empty array for ability with no steps', () => {
      const emitter = new GameEventEmitter()
      const ap = new AbilityProcessor(makeGs(), emitter)
      const ability: IAbility = { steps: [] }
      const ctx = new AbilityContext('card-1', 'p1')
      expect(ap.process(ability, makeGs(), ctx)).toEqual([])
    })

    it('should collect events from all steps', () => {
      const emitter = new GameEventEmitter()
      const ap = new AbilityProcessor(makeGs(), emitter)
      const e1 = new GameEvent(
        GameEventType.CardDrawn,
        'p1',
        {},
        Audience.PlayerOnly,
      )
      const e2 = new GameEvent(
        GameEventType.CardDrawn,
        'p1',
        {},
        Audience.PlayerOnly,
      )
      const ability: IAbility = { steps: [makeTask([e1]), makeTask([e2])] }
      const ctx = new AbilityContext('card-1', 'p1')
      const result = ap.process(ability, makeGs(), ctx)
      expect(result).toHaveLength(2)
      expect(result[0]).toBe(e1)
      expect(result[1]).toBe(e2)
    })

    it('should execute steps in order', () => {
      const emitter = new GameEventEmitter()
      const ap = new AbilityProcessor(makeGs(), emitter)
      const order: number[] = []
      const step1: ITask = {
        execute: () => {
          order.push(1)
          return []
        },
      }
      const step2: ITask = {
        execute: () => {
          order.push(2)
          return []
        },
      }
      const ability: IAbility = { steps: [step1, step2] }
      ap.process(ability, makeGs(), new AbilityContext('c', 'p'))
      expect(order).toEqual([1, 2])
    })
  })

  describe('onEvent() — passives', () => {
    it('should not fire passive for non-matching trigger', () => {
      const emitter = new GameEventEmitter()
      const ap = new AbilityProcessor(makeGs(), emitter)
      const fired: boolean[] = []
      const step: ITask = {
        execute: () => {
          fired.push(true)
          return []
        },
      }
      const passive: IPassive = {
        trigger: GameEventType.TurnStarted,
        steps: [step],
      }
      ap.registerPassive('card-1', 'p1', passive)
      ap.onEvent(makeDiceRolledEvent()) // different type
      expect(fired).toHaveLength(0)
    })

    it('should fire passive when trigger matches', () => {
      const emitter = new GameEventEmitter()
      const ap = new AbilityProcessor(makeGs(), emitter)
      const fired: boolean[] = []
      const step: ITask = {
        execute: () => {
          fired.push(true)
          return []
        },
      }
      const passive: IPassive = {
        trigger: GameEventType.DiceRolled,
        steps: [step],
      }
      ap.registerPassive('card-1', 'p1', passive)
      ap.onEvent(makeDiceRolledEvent())
      expect(fired).toHaveLength(1)
    })

    it('should emit events produced by passive tasks', () => {
      const emitter = new GameEventEmitter()
      const listener = {
        received: [] as IGameEvent[],
        onEvent(e: IGameEvent) {
          this.received.push(e)
        },
      }
      emitter.addListener(listener)

      const ap = new AbilityProcessor(makeGs(), emitter)
      const taskEvent = new GameEvent(
        GameEventType.CardDrawn,
        'p1',
        {},
        Audience.PlayerOnly,
      )
      const step: ITask = { execute: () => [taskEvent] }
      const passive: IPassive = {
        trigger: GameEventType.DiceRolled,
        steps: [step],
      }
      ap.registerPassive('card-1', 'p1', passive)
      ap.onEvent(makeDiceRolledEvent())
      expect(listener.received).toContain(taskEvent)
    })

    it('should stop firing after unregister', () => {
      const emitter = new GameEventEmitter()
      const ap = new AbilityProcessor(makeGs(), emitter)
      const fired: boolean[] = []
      const step: ITask = {
        execute: () => {
          fired.push(true)
          return []
        },
      }
      const passive: IPassive = {
        trigger: GameEventType.DiceRolled,
        steps: [step],
      }
      ap.registerPassive('card-1', 'p1', passive)
      ap.unregisterPassivesFor('card-1')
      ap.onEvent(makeDiceRolledEvent())
      expect(fired).toHaveLength(0)
    })
  })
})
