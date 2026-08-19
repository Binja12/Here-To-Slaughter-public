import { CardType, GameEventType, IGameEvent, ReactionWindowType } from 'shared'
import { ChoiceWindow } from './choice-window'
import { CardChoiceWindow } from './card-choice-window'
import { MagicCard } from '../cards/magic-card'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { CTX_CHOSEN_CARD, NO_CONTEXT_RESULT } from '../ability-context'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Concrete subclass so the abstract base can be exercised directly. */
class TestChoiceWindow extends ChoiceWindow {
  getType(): ReactionWindowType {
    return ReactionWindowType.CardChoice
  }

  override resultKey(): string | typeof NO_CONTEXT_RESULT {
    return CTX_CHOSEN_CARD
  }
}

function makeWindow({
  gs,
  em,
  options = ['a', 'b', 'c'],
  respondentId = 'p1',
  timeoutMs = 5000,
  frameId = 'frame-1',
}: {
  gs: GameState
  em: GameEventEmitter
  options?: unknown[]
  respondentId?: string
  timeoutMs?: number
  frameId?: string
}): TestChoiceWindow {
  const win = new TestChoiceWindow('win-1', respondentId, options, timeoutMs, gs, frameId, em)
  gs.addFrame(frameId, { snapshot: gs.clone(), windows: [win] })
  return win
}

const payloadOf = (e: IGameEvent) => e.getPayload() as Record<string, unknown>

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChoiceWindow', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  // -------------------------------------------------------------------------
  // Opening
  // -------------------------------------------------------------------------

  it('emits ReactionWindowOpened with its type and options', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    makeWindow({ gs, em, options: ['a', 'b'] })

    const opened = events.find((e) => e.getType() === GameEventType.ReactionWindowOpened)
    expect(opened).toBeDefined()
    expect(payloadOf(opened!)['windowType']).toBe(ReactionWindowType.CardChoice)
    expect(payloadOf(opened!)['options']).toEqual(['a', 'b'])
  })

  it('is open before anything is submitted', () => {
    const gs = makeGs()
    const win = makeWindow({ gs, em: new GameEventEmitter() })
    expect(win.isOpen()).toBe(true)
  })

  it('resolves on the next tick when there are no options', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = new TestChoiceWindow('w', 'p1', [], 5000, gs, 'frame-1', em)

    // Still open until the tick: resolving inline would settle the frame before...
    expect(win.isOpen()).toBe(true)
    jest.advanceTimersByTime(0)
    expect(win.isOpen()).toBe(false)
    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['results']).toEqual([])
  })

  // -------------------------------------------------------------------------
  // Submitting
  // -------------------------------------------------------------------------

  it('resolves on the first valid submission — no timer extension', () => {
    const gs = makeGs()
    const win = makeWindow({ gs, em: new GameEventEmitter() })

    win.submitReaction('p1', { choice: 'b' })

    expect(win.isOpen()).toBe(false)
  })

  it('emits FrameResolved carrying the pick', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = makeWindow({ gs, em })

    win.submitReaction('p1', { choice: 'b' })

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['results']).toEqual(['b'])
  })

  it('ignores a submission from anyone but the respondent', () => {
    const gs = makeGs()
    const win = makeWindow({ gs, em: new GameEventEmitter(), respondentId: 'p1' })

    win.submitReaction('p2', { choice: 'b' })

    expect(win.isOpen()).toBe(true)
  })

  it('ignores a choice that was not offered', () => {
    const gs = makeGs()
    const win = makeWindow({ gs, em: new GameEventEmitter(), options: ['a', 'b'] })

    win.submitReaction('p1', { choice: 'zzz' })

    expect(win.isOpen()).toBe(true)
  })

  it('ignores a second submission after resolving', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = makeWindow({ gs, em })

    win.submitReaction('p1', { choice: 'a' })
    win.submitReaction('p1', { choice: 'b' })

    const resolutions = events.filter((e) => e.getType() === GameEventType.FrameResolved)
    expect(resolutions).toHaveLength(1)
    expect(payloadOf(resolutions[0])['results']).toEqual(['a'])
  })

  // -------------------------------------------------------------------------
  // Timeout
  // -------------------------------------------------------------------------

  it('picks NOTHING on timeout — a silent player names no target', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    makeWindow({ gs, em, options: ['a', 'b', 'c'], timeoutMs: 5000 })

    jest.advanceTimersByTime(5000)

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['results']).toEqual([])
  })

  it('RESOLVES on timeout rather than rolling back', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    makeWindow({ gs, em, options: ['a', 'b', 'c'], timeoutMs: 5000, frameId: 'f1' })

    jest.advanceTimersByTime(5000)

    expect(gs.frames.has('f1')).toBe(false)
  })

  it('does not resolve before the timeout elapses', () => {
    const gs = makeGs()
    const win = makeWindow({ gs, em: new GameEventEmitter(), timeoutMs: 5000 })

    jest.advanceTimersByTime(4999)

    expect(win.isOpen()).toBe(true)
  })

  it('does not fire the timer after an explicit submission', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = makeWindow({ gs, em, timeoutMs: 5000 })

    win.submitReaction('p1', { choice: 'a' })
    jest.advanceTimersByTime(10000)

    expect(events.filter((e) => e.getType() === GameEventType.FrameResolved)).toHaveLength(1)
  })

  // -------------------------------------------------------------------------
  // Frame handling
  // -------------------------------------------------------------------------

  // Card/player choices have no failure case, so they always release. Only
  it('releases its frame when the pick is a success', () => {
    const gs = makeGs()
    const win = makeWindow({ gs, em: new GameEventEmitter(), frameId: 'frame-1' })

    win.submitReaction('p1', { choice: 'a' })

    expect(gs.frames.has('frame-1')).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Self-describing results — the window names its own context slot
  // -------------------------------------------------------------------------

  it('carries its context slot and value on FrameResolved', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = makeWindow({ gs, em })

    win.submitReaction('p1', { choice: 'a' })

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['result']).toEqual({
      key: CTX_CHOSEN_CARD,
      value: ['a'],
    })
  })

  it('reports results as an array, so multi-select needs no migration', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = makeWindow({ gs, em })

    win.submitReaction('p1', { choice: 'a' })

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['results']).toEqual(['a'])
  })

  it('reports an empty array when there was nothing to pick', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    new TestChoiceWindow('w', 'p1', [], 5000, gs, 'frame-1', em)
    jest.advanceTimersByTime(0)

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['results']).toEqual([])
  })

  it('emits ReactionWindowClosed before FrameResolved', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = makeWindow({ gs, em })

    win.submitReaction('p1', { choice: 'a' })

    const closedAt = events.findIndex((e) => e.getType() === GameEventType.ReactionWindowClosed)
    const resolvedAt = events.findIndex((e) => e.getType() === GameEventType.FrameResolved)
    expect(closedAt).toBeGreaterThanOrEqual(0)
    expect(closedAt).toBeLessThan(resolvedAt)
  })
})

// ---------------------------------------------------------------------------
// CardChoiceWindow — the one subclass whose silent answer is not "nothing"
// ---------------------------------------------------------------------------

describe('CardChoiceWindow', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  const makeCard = (id: string) =>
    new MagicCard({
      id,
      name: id,
      type: CardType.Magic,
      image: '',
      description: '',
      set: 'test',
    })

  const openOn = (gs: GameState, em: GameEventEmitter, options: string[]) => {
    for (const id of options) gs.registerCard(makeCard(id))
    const win = new CardChoiceWindow('win-1', 'p1', options, 5000, gs, 'f1', em)
    gs.addFrame('f1', { snapshot: gs.clone(), windows: [win] })
    return win
  }

  it('picks one of the options on timeout — a card choice cannot be waited out', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    openOn(gs, em, ['a', 'b', 'c'])

    jest.advanceTimersByTime(5000)

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['results']).toHaveLength(1)
    expect(['a', 'b', 'c']).toContain(
      (payloadOf(resolved!)['results'] as string[])[0],
    )
  })

  it('draws the idle pick from the offered list, not the whole table', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    gs.registerCard(makeCard('not-offered'))
    // Last option, so a default that ignored the list would miss it.
    jest.spyOn(Math, 'random').mockReturnValue(0.99)
    openOn(gs, em, ['a', 'b'])

    jest.advanceTimersByTime(5000)

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['results']).toEqual(['b'])
  })

  it('picks nothing when there was nothing to offer', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    openOn(gs, em, [])

    jest.advanceTimersByTime(0)

    // Empty means it ran and produced nothing; the steps behind it skip.
    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['results']).toEqual([])
  })

  it('still honours an explicit pick', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const events = collect(em)
    const win = openOn(gs, em, ['a', 'b', 'c'])

    win.submitReaction('p1', { choice: 'c' })

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect(payloadOf(resolved!)['results']).toEqual(['c'])
  })
})
