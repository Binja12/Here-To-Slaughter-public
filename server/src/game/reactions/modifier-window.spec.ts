import { GameEventType, IGameEvent, PassiveType, ReactionWindowType } from 'shared'
import { Player } from '../player'
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

describe('ModifierWindow — standing bonuses stack, each keeping its source', () => {
  let gs: GameState
  let em: GameEventEmitter
  let events: IGameEvent[]

  const giveRollBonus = (sourceCardId: string, value: number) =>
    gs.addEffect({
      id: 'eff-' + sourceCardId,
      sourceCardId,
      ownerId: 'p1',
      type: PassiveType.RollBonus,
      value,
    })

  beforeEach(() => {
    jest.useFakeTimers()
    gs = makeGs()
    em = new GameEventEmitter()
    events = collect(em)
    gs.registerPlayer(
      new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-p', actionPoints: 3 }),
    )
  })
  afterEach(() => jest.useRealTimers())

  it('adds two different sources together and keeps them distinguishable', () => {
    giveRollBonus('hero-028', 3)
    giveRollBonus('hero-029', 5)

    makeWindow({ gs, em, rollerId: 'p1', baseRoll: 2 })

    const opened = events.find(
      (e) => e.getType() === GameEventType.ReactionWindowOpened,
    )!
    const payload = opened.getPayload() as Record<string, unknown>
    expect(payload['finalRoll']).toBe(10) // 2 + 3 + 5
    expect(payload['bonuses']).toEqual([
      { cardSource: 'hero-028', amount: 3 },
      { cardSource: 'hero-029', amount: 5 },
    ])
  })

  it('two copies of one card design stack — each copy is its own card id', () => {
    giveRollBonus('magic-012', 2)
    giveRollBonus('magic-013', 2)

    makeWindow({ gs, em, rollerId: 'p1', baseRoll: 3 })

    const payload = events
      .find((e) => e.getType() === GameEventType.ReactionWindowOpened)!
      .getPayload() as Record<string, unknown>
    expect(payload['finalRoll']).toBe(7) // 3 + 2 + 2, neither swallowed
    expect(payload['bonuses']).toEqual([
      { cardSource: 'magic-012', amount: 2 },
      { cardSource: 'magic-013', amount: 2 },
    ])
  })

  it('two modifier cards played into one window both count, each named', () => {
    const win = makeWindow({ gs, em, rollerId: 'p1', baseRoll: 3 })
    win.submitReaction('p2', { value: 2, cardId: 'mod-1', targetPlayerId: 'p1' })
    win.submitReaction('p2', { value: 2, cardId: 'mod-2', targetPlayerId: 'p1' })
    win.resolve()

    const closed = events.find(
      (e) => e.getType() === GameEventType.ReactionWindowClosed,
    )!
    expect(closed.getPayload()).toMatchObject({ finalRoll: 7 })
  })

  it('a bonus belonging to another player is not picked up', () => {
    gs.registerPlayer(
      new Player({ id: 'p2', name: 'p2', hand: [], partyId: 'p2-p', actionPoints: 3 }),
    )
    gs.addEffect({
      id: 'eff-other',
      sourceCardId: 'hero-028',
      ownerId: 'p2',
      type: PassiveType.RollBonus,
        value: 3,
    })

    makeWindow({ gs, em, rollerId: 'p1', baseRoll: 2 })

    const payload = events
      .find((e) => e.getType() === GameEventType.ReactionWindowOpened)!
      .getPayload() as Record<string, unknown>
    expect(payload['bonuses']).toEqual([])
    expect(payload['finalRoll']).toBe(2)
  })
})

describe('ModifierWindow — targetPlayerId', () => {
  let gs: GameState
  let em: GameEventEmitter
  let events: IGameEvent[]

  beforeEach(() => {
    jest.useFakeTimers()
    gs = makeGs()
    em = new GameEventEmitter()
    events = collect(em)
  })
  afterEach(() => jest.useRealTimers())

  const applied = () =>
    events.filter((e) => e.getType() === GameEventType.ModifierApplied)

  it('applies a modifier aimed at the roller', () => {
    const win = makeWindow({ gs, em, rollerId: 'p1', baseRoll: 3 })
    win.submitReaction('p2', { value: 4, cardId: 'mod-1', targetPlayerId: 'p1' })
    expect(applied()).toHaveLength(1)
    expect(applied()[0].getPayload()).toMatchObject({ finalRoll: 7 })
  })

  it('applies a modifier with no target named — a plain roll has only one', () => {
    const win = makeWindow({ gs, em, rollerId: 'p1', baseRoll: 3 })
    win.submitReaction('p2', { value: 4, cardId: 'mod-1' })
    expect(applied()).toHaveLength(1)
    expect(applied()[0].getPayload()).toMatchObject({ finalRoll: 7 })
  })

  it('REFUSES a modifier aimed at anyone else — it used to help the roller', () => {
    const win = makeWindow({ gs, em, rollerId: 'p1', baseRoll: 3 })
    win.submitReaction('p2', { value: 4, cardId: 'mod-1', targetPlayerId: 'p2' })
    expect(applied()).toHaveLength(0)

    // and the refusal must not leak into the settled roll either
    win.resolve()
    const closed = events.find(
      (e) => e.getType() === GameEventType.ReactionWindowClosed,
    )
    expect(closed!.getPayload()).toMatchObject({ finalRoll: 3 })
  })
})

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

  // There is ONE lifecycle event for every window kind; consumers tell them
  // apart by payload windowType rather than by subscribing per window type.
  it('emits ReactionWindowOpened tagged as a Modifier window', () => {
    makeWindow({ gs, em })
    const e = events.find((e) => e.getType() === GameEventType.ReactionWindowOpened)
    expect(e).toBeDefined()
    expect((e!.getPayload() as { windowType: string }).windowType).toBe(
      ReactionWindowType.Modifier,
    )
  })

  // The roll detail rides in the same event, so collapsing the bespoke
  // ModifierWindowOpened lost the client nothing.
  it('carries the roll detail on ReactionWindowOpened', () => {
    makeWindow({ gs, em, rollerId: 'p1', baseRoll: 4, rollReq: 7, heroId: 'h1' })
    const e = events.find((e) => e.getType() === GameEventType.ReactionWindowOpened)
    expect(e).toBeDefined()
    expect(e!.getPlayerId()).toBe('p1')
    expect(e!.getPayload()).toMatchObject({ rollerId: 'p1', baseRoll: 4, rollReq: 7, heroId: 'h1' })
  })

  it('reports the final roll as the ReactionWindowClosed outcome', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5 })
    win.resolve()
    const e = events.find((e) => e.getType() === GameEventType.ReactionWindowClosed)
    expect((e!.getPayload() as { outcome: unknown }).outcome).toBe(6)
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
  // resolve() — both paths emit ReactionWindowClosed and FrameResolved
  // ---------------------------------------------------------------------------

  it('emits ReactionWindowClosed on success path', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5 }) // 6 >= 5 → success
    win.resolve()
    expect(events.some((e) => e.getType() === GameEventType.ReactionWindowClosed)).toBe(true)
  })

  it('emits ReactionWindowClosed on fail path', () => {
    const win = makeWindow({ gs, em, baseRoll: 3, rollReq: 5 }) // 3 < 5 → fail
    win.resolve()
    expect(events.some((e) => e.getType() === GameEventType.ReactionWindowClosed)).toBe(true)
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

  it('success: emits RollSuccess', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5 })
    win.resolve()
    expect(events.some((e) => e.getType() === GameEventType.RollSuccess)).toBe(true)
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

  it('fail: does NOT emit RollSuccess', () => {
    const win = makeWindow({ gs, em, baseRoll: 3, rollReq: 5 })
    win.resolve()
    expect(events.some((e) => e.getType() === GameEventType.RollSuccess)).toBe(false)
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
    expect(count(GameEventType.ReactionWindowClosed)).toBe(1)
    expect(count(GameEventType.FrameResolved)).toBe(1)
    expect(count(GameEventType.RollSuccess)).toBe(1)
  })
})
