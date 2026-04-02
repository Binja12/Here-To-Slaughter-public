import { TurnManager } from './turn-manager'
import { ReactionManager } from './reaction-manager'
import { makeTestGameState } from './test-helpers'
import { TurnPhase } from '../../../../shared/src/enums'
import { IAction, IGameEvent } from './engine-interfaces'
import { ActionType } from '../../../../shared/src/enums'
import { GameEventType } from '../../../../shared/src/enums'

const makeAction = (
  playerId: string,
  cost: number,
  challengeable: boolean = false,
  cardId: string = 'card-001',
): IAction => {
  let _challengeable = challengeable
  return {
    getId: () => 'action-001',
    getType: () => ActionType.DrawCard,
    getPlayerId: () => playerId,
    getCost: () => cost,
    isChallengeable: () => (_challengeable ? cardId : null),
    setChallengeable: (value: boolean) => {
      _challengeable = value
    },
    canExecute: () => true,
    execute: () => [],
  }
}

describe('TurnManager', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const makeManager = (flawPlay = false) => {
    const gs = makeTestGameState()
    const events: IGameEvent[] = []
    const rm = new ReactionManager(gs)
    const tm = new TurnManager(gs, rm, (e) => events.push(...e), flawPlay)
    return { tm, gs, rm, events }
  }

  // ── startTurn ───────────────────────────────────────────────

  it('should set active player on startTurn', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    expect(tm.getActivePlayerId()).toBe('player-1')
  })

  it('should reset action points on startTurn', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    expect(tm.getActionPoints()).toBe(3)
  })

  it('should set phase to ActionWindow on startTurn', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    expect(tm.getPhase()).toBe(TurnPhase.ActionWindow)
  })

  it('should emit TurnStarted event', () => {
    const { tm, events } = makeManager()
    tm.startTurn('player-1')
    expect(events.some((e) => e.getType() === GameEventType.TurnStarted)).toBe(
      true,
    )
  })

  // ── submitAction ────────────────────────────────────────────

  it('should throw when no active turn', () => {
    const { tm } = makeManager()
    expect(() => tm.submitAction(makeAction('player-1', 1))).toThrow(
      'No active turn',
    )
  })

  it('should throw when not your turn', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    expect(() => tm.submitAction(makeAction('player-2', 1))).toThrow(
      'Not your turn',
    )
  })

  it('should throw when not enough action points', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    expect(() => tm.submitAction(makeAction('player-1', 4))).toThrow(
      'Not enough action points',
    )
  })

  it('should deduct action points', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    tm.submitAction(makeAction('player-1', 1))
    expect(tm.getActionPoints()).toBe(2)
  })

  it('should execute non-challengeable action immediately', () => {
    const execute = jest.fn().mockReturnValue([])
    const { tm } = makeManager()
    tm.startTurn('player-1')
    const action = { ...makeAction('player-1', 1), execute }
    tm.submitAction(action)
    expect(execute).toHaveBeenCalled()
  })

  it('should end turn when action points reach 0', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    tm.submitAction(makeAction('player-1', 3))
    expect(tm.getActivePlayerId()).toBe('player-2')
  })

  // ── challenge window ────────────────────────────────────────

  it('should open challenge window for challengeable action', () => {
    const { tm, rm } = makeManager()
    tm.startTurn('player-1')
    tm.submitAction(makeAction('player-1', 1, true))
    expect(rm.getChallengeWindow()).toBeDefined()
  })

  it('should not execute challengeable action until window resolves', () => {
    const execute = jest.fn().mockReturnValue([])
    const { tm } = makeManager()
    tm.startTurn('player-1')
    const action = { ...makeAction('player-1', 1, true), execute }
    tm.submitAction(action)
    expect(execute).not.toHaveBeenCalled()
  })

  it('should execute action when timer expires with no challenge', () => {
    const execute = jest.fn().mockReturnValue([])
    const { tm } = makeManager()
    tm.startTurn('player-1')
    const action = { ...makeAction('player-1', 1, true), execute }
    tm.submitAction(action)
    jest.advanceTimersByTime(5000)
    expect(execute).toHaveBeenCalled()
  })

  it('should restore snapshot when challenger wins', () => {
    const execute = jest.fn().mockReturnValue([])
    const { tm, rm, gs } = makeManager()
    tm.startTurn('player-1')
    const action = { ...makeAction('player-1', 1, true), execute }
    tm.submitAction(action)

    // simulate challenger winning
    const window = rm.getChallengeWindow()!
    window.resolve(gs)
    jest.spyOn(window, 'didChallengerWin').mockReturnValue(true)
    jest.advanceTimersByTime(5000)

    expect(execute).not.toHaveBeenCalled()
  })

  // ── standard mode blocks actions during window ──────────────

  it('should block challengeable actions during open window', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    tm.submitAction(makeAction('player-1', 1, true))
    expect(() => tm.submitAction(makeAction('player-1', 1, true))).toThrow(
      'Cannot play challengeable action while reaction window is open',
    )
  })

  it('should block all actions in standard mode during open window', () => {
    const { tm } = makeManager(false)
    tm.startTurn('player-1')
    tm.submitAction(makeAction('player-1', 1, true))
    expect(() => tm.submitAction(makeAction('player-1', 1, false))).toThrow(
      'Cannot act while reaction window is open',
    )
  })

  it('should allow non-challengeable actions in flaw play during open window', () => {
    const { tm } = makeManager(true)
    tm.startTurn('player-1')
    tm.submitAction(makeAction('player-1', 1, true))
    expect(() =>
      tm.submitAction(makeAction('player-1', 1, false)),
    ).not.toThrow()
  })

  // ── hero effect tracking ────────────────────────────────────

  it('should track used hero effects', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    tm.markHeroEffectUsed('hero-001')
    expect(tm.isHeroEffectUsed('hero-001')).toBe(true)
  })

  it('should return false for unused hero effect', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    expect(tm.isHeroEffectUsed('hero-001')).toBe(false)
  })

  // ── endTurn ─────────────────────────────────────────────────

  it('should move to next player on endTurn', () => {
    const { tm } = makeManager()
    tm.startTurn('player-1')
    tm.endTurn()
    expect(tm.getActivePlayerId()).toBe('player-2')
  })

  it('should emit TurnEnded event', () => {
    const { tm, events } = makeManager()
    tm.startTurn('player-1')
    tm.endTurn()
    expect(events.some((e) => e.getType() === GameEventType.TurnEnded)).toBe(
      true,
    )
  })
})
