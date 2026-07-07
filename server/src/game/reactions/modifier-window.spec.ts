import { GameEventType, IGameEvent, ReactionWindowType } from 'shared'
import { ModifierWindow } from './modifier-window'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'

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

/**
 * Build a ModifierWindow then register its frame in gs.
 * The window constructor fires immediately (emits opened + starts timer),
 * so the frame must be added afterwards — resolve() only needs it to exist.
 */
function makeWindow({
  gs,
  em,
  id = 'win-1',
  rollerId = 'p1',
  baseRoll = 3,
  rollReq = 5,
  heroId = 'hero-1',
  timeoutMs = 5000,
  frameId = 'frame-1',
}: {
  gs: GameState
  em: GameEventEmitter
  id?: string
  rollerId?: string
  baseRoll?: number
  rollReq?: number
  heroId?: string
  timeoutMs?: number
  frameId?: string
}): ModifierWindow {
  const win = new ModifierWindow(id, rollerId, baseRoll, rollReq, heroId, timeoutMs, gs, frameId, em)
  gs.addFrame(frameId, { snapshot: gs.clone(), windows: [win] })
  return win
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModifierWindow', () => {
  let gs: GameState
  let em: GameEventEmitter
  let events: IGameEvent[]

  beforeEach(() => {
    jest.useFakeTimers()
    gs = makeGs()
    em = new GameEventEmitter()
    events = collect(em)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  it('emits ModifierWindowOpened immediately on construction', () => {
    makeWindow({ gs, em, rollerId: 'p1', baseRoll: 4, rollReq: 7, heroId: 'h1' })
    const e = events.find((e) => e.getType() === GameEventType.ModifierWindowOpened)
    expect(e).toBeDefined()
    expect(e!.getPlayerId()).toBe('p1')
    expect(e!.getPayload()).toMatchObject({ rollerId: 'p1', baseRoll: 4, rollReq: 7, heroId: 'h1' })
  })

  it('getType() returns Modifier', () => {
    expect(makeWindow({ gs, em }).getType()).toBe(ReactionWindowType.Modifier)
  })

  // ---------------------------------------------------------------------------
  // isOpen
  // ---------------------------------------------------------------------------

  it('isOpen() is true immediately after construction', () => {
    expect(makeWindow({ gs, em }).isOpen()).toBe(true)
  })

  it('isOpen() is false after resolve()', () => {
    const win = makeWindow({ gs, em })
    win.resolve()
    expect(win.isOpen()).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // getFinalRoll / submitReaction
  // ---------------------------------------------------------------------------

  it('getFinalRoll() equals baseRoll when no bonuses submitted', () => {
    const win = makeWindow({ gs, em, baseRoll: 4 })
    expect(win.getFinalRoll()).toBe(4)
  })

  it('getFinalRoll() accumulates multiple bonuses', () => {
    const win = makeWindow({ gs, em, baseRoll: 3 })
    win.submitReaction('p1', { value: 2 })
    win.submitReaction('p2', { value: 1 })
    expect(win.getFinalRoll()).toBe(6)
  })

  it('submitReaction emits ModifierApplied with value and running finalRoll', () => {
    const win = makeWindow({ gs, em, baseRoll: 3 })
    win.submitReaction('p1', { value: 2 })
    const e = events.find((e) => e.getType() === GameEventType.ModifierApplied)
    expect(e).toBeDefined()
    expect(e!.getPlayerId()).toBe('p1')
    expect(e!.getPayload()).toMatchObject({ value: 2, finalRoll: 5 })
  })

  // ---------------------------------------------------------------------------
  // resolve() — both paths emit ModifierWindowClosed and FrameResolved
  // ---------------------------------------------------------------------------

  it('emits ModifierWindowClosed on success path', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5 }) // 6 >= 5 → success
    win.resolve()
    expect(events.some((e) => e.getType() === GameEventType.ModifierWindowClosed)).toBe(true)
  })

  it('emits ModifierWindowClosed on fail path', () => {
    const win = makeWindow({ gs, em, baseRoll: 3, rollReq: 5 }) // 3 < 5 → fail
    win.resolve()
    expect(events.some((e) => e.getType() === GameEventType.ModifierWindowClosed)).toBe(true)
  })

  it('emits FrameResolved on success path', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5 })
    win.resolve()
    expect(events.some((e) => e.getType() === GameEventType.FrameResolved)).toBe(true)
  })

  it('emits FrameResolved on fail path', () => {
    const win = makeWindow({ gs, em, baseRoll: 3, rollReq: 5 })
    win.resolve()
    expect(events.some((e) => e.getType() === GameEventType.FrameResolved)).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // resolve() — success path
  // ---------------------------------------------------------------------------

  it('success: releases frame (frame absent from gs.frames after resolve)', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5, frameId: 'f-success' })
    expect(gs.frames.has('f-success')).toBe(true)
    win.resolve()
    expect(gs.frames.has('f-success')).toBe(false)
  })

  it('success: does NOT emit RollSuccess (outcome task handles that)', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5 })
    win.resolve()
    expect(events.some((e) => e.getType() === GameEventType.RollSuccess)).toBe(false)
  })

  it('success: does NOT call markAbilityUsed (that happens before openFrame)', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5 })
    win.resolve()
    expect(gs.getAbilitiesUsedThisTurn()).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // resolve() — fail path
  // ---------------------------------------------------------------------------

  it('fail: restores frame — state mutations after snapshot are undone', () => {
    const win = makeWindow({ gs, em, baseRoll: 3, rollReq: 5, frameId: 'f-fail' })
    // Mutate after snapshot was taken (makeWindow calls gs.clone() for the snapshot)
    gs.markAbilityUsed('some-hero')
    expect(gs.getAbilitiesUsedThisTurn()).toContain('some-hero')

    win.resolve()

    expect(gs.getAbilitiesUsedThisTurn()).not.toContain('some-hero')
  })

  it('fail: frame is absent from gs.frames after restoreFrame', () => {
    const win = makeWindow({ gs, em, baseRoll: 3, rollReq: 5, frameId: 'f-fail' })
    win.resolve()
    expect(gs.frames.has('f-fail')).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Timeout + double-resolve
  // ---------------------------------------------------------------------------

  it('resolves automatically when timeout elapses', () => {
    const win = makeWindow({ gs, em, timeoutMs: 3000 })
    expect(win.isOpen()).toBe(true)
    jest.runAllTimers()
    expect(win.isOpen()).toBe(false)
  })

  it('double resolve is a no-op — events emitted exactly once', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5 })
    win.resolve()
    win.resolve()
    const count = (type: GameEventType) => events.filter((e) => e.getType() === type).length
    expect(count(GameEventType.ModifierWindowClosed)).toBe(1)
    expect(count(GameEventType.FrameResolved)).toBe(1)
  })

  it('no rollReq: always releases frame regardless of finalRoll', () => {
    const win = makeWindow({ gs, em, baseRoll: 1, rollReq: undefined, frameId: 'f-norollreq' })
    win.resolve()
    expect(gs.frames.has('f-norollreq')).toBe(false)
    expect(gs.getAbilitiesUsedThisTurn()).toHaveLength(0) // not restored
  })
})
