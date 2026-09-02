import { GameEventType, IGameEvent, ReactionWindowType } from 'shared'
import { CONFIRM, DISMISS, TaskChoiceWindow } from './task-choice-window'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { NO_CONTEXT_RESULT } from '../abilities/ability-context'

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const collect = (em: GameEventEmitter): IGameEvent[] => {
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return events
}

function makeWindow(gs: GameState, em: GameEventEmitter, frameId = 'frame-1') {
  const win = new TaskChoiceWindow('win-1', 'p1', 5000, gs, frameId, em)
  gs.addFrame(frameId, { snapshot: gs.clone(), windows: [win] })
  return win
}

const resultOf = (events: IGameEvent[]) => {
  const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
  return (resolved!.getPayload() as { results: unknown[] }).results[0]
}

describe('TaskChoiceWindow', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('reports its own window type', () => {
    const gs = makeGs()
    const win = makeWindow(gs, new GameEventEmitter())
    expect(win.getType()).toBe(ReactionWindowType.TaskChoice)
  })

  // Asserting the sentinel, not `undefined` — this pins "decided there is no
  // context result", which an author forgetting to declare one cannot satisfy.
  it('declares NO_CONTEXT_RESULT rather than leaving the key unset', () => {
    const gs = makeGs()
    const win = makeWindow(gs, new GameEventEmitter())
    expect(win.resultKey()).toBe(NO_CONTEXT_RESULT)
  })

  it('writes nothing to the context when it resolves', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = makeWindow(gs, em)

    win.submitReaction('p1', { choice: CONFIRM })

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect((resolved!.getPayload() as { result?: unknown }).result).toBeUndefined()
  })

  it('offers exactly confirm and dismiss', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    makeWindow(gs, em)

    const opened = events.find((e) => e.getType() === GameEventType.ReactionWindowOpened)
    expect((opened!.getPayload() as { options: unknown[] }).options).toEqual([CONFIRM, DISMISS])
  })

  it('resolves to confirm when the player confirms', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = makeWindow(gs, em)

    win.submitReaction('p1', { choice: CONFIRM })

    expect(resultOf(events)).toBe(CONFIRM)
  })

  it('resolves to dismiss when the player dismisses', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = makeWindow(gs, em)

    win.submitReaction('p1', { choice: DISMISS })

    expect(resultOf(events)).toBe(DISMISS)
  })

  // The one window that does NOT pick randomly on timeout: an opt-in prompt
  // must not commit an idle player to an effect they never asked for.
  it('defaults to dismiss on timeout, never a coin flip', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    makeWindow(gs, em)

    jest.advanceTimersByTime(5000)

    expect(resultOf(events)).toBe(DISMISS)
  })
})
