import { CardType, GameEventType, IGameEvent, PassiveType, ReactionWindowType, Zone } from 'shared'
import { ModifierCard } from '../cards/modifier-card'
import { PlayerChoiceWindow } from './player-choice-window'
import { CTX_CHOSEN_CARD, CTX_CHOSEN_PLAYER } from '../abilities/ability-context'
import { Player } from '../state-structures/player'
import { ModifierWindow } from './modifier-window'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'

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
  gs.addFrame(frameId, gs.clone(), [win])
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

  it('success: releases frame (frame absent from gs.getFrames() after resolve)', () => {
    const win = makeWindow({ gs, em, baseRoll: 6, rollReq: 5, frameId: 'f-success' })
    expect(gs.getFrames().has('f-success')).toBe(true)
    win.resolve()
    expect(gs.getFrames().has('f-success')).toBe(false)
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

  it('fail: frame is absent from gs.getFrames() after restoreFrame', () => {
    const win = makeWindow({ gs, em, baseRoll: 3, rollReq: 5, frameId: 'f-fail' })
    win.resolve()
    expect(gs.getFrames().has('f-fail')).toBe(false)
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

describe('ModifierWindow — the target is asked while the roll stands', () => {
  const modifierCard = (id: string) =>
    new ModifierCard({ id, name: id, type: CardType.Modifier, image: '', description: '', set: '', values: [2, -2] })
  let gs: GameState
  let em: GameEventEmitter
  let events: IGameEvent[]
  const passing = (): IGameEvent[] => events.filter((e) => e.getType() === GameEventType.RollPassing)

  beforeEach(() => {
    jest.useFakeTimers()
    gs = makeGs()
    em = new GameEventEmitter()
    events = collect(em)
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'party-1', actionPoints: 3 }))
    gs.registerPlayer(new Player({ id: 'p2', name: 'p2', hand: ['their-card'], partyId: 'party-2', actionPoints: 3 }))
    for (const id of ['mod-1', 'mod-2']) gs.registerCard(modifierCard(id))
  })
  afterEach(() => jest.useRealTimers())

  it('announces RollPassing at open when the roll meets the requirement, and not when it falls short', () => {
    makeWindow({ gs, em, baseRoll: 5, rollReq: 5 })
    expect(passing()).toHaveLength(1)
    expect(passing()[0].getPayload()).toMatchObject({ cardId: 'hero-1' })

    events.length = 0
    makeWindow({ gs, em, id: 'win-2', frameId: 'frame-2', baseRoll: 4, rollReq: 5 })
    expect(passing()).toHaveLength(0)
  })

  it('announces it when a modifier rescues the roll, and only once however often it flips', () => {
    const win = makeWindow({ gs, em, baseRoll: 3, rollReq: 5 })
    win.submitReaction('p2', { value: 2, cardId: 'mod-1' })
    expect(passing()).toHaveLength(1)

    win.submitReaction('p2', { value: -1, cardId: 'leader-x' })
    win.submitReaction('p2', { value: 1, cardId: 'leader-y' })
    expect(passing()).toHaveLength(1)
  })

  it('a target landing is shown as its seat, gives everyone another look, and rides on RollSuccess', () => {
    const win = makeWindow({ gs, em, baseRoll: 5, rollReq: 5 })
    win.pass('p2')
    const before = win.getDeadline()
    jest.advanceTimersByTime(1000)

    win.targetChosen(CTX_CHOSEN_PLAYER, ['p2'], Zone.Hand)

    expect(win.getDetail()).toMatchObject({
      targets: [{ playerId: 'p2', zone: Zone.Hand }],
      passedBy: [],
    })
    expect(win.getDeadline()).toBeGreaterThan(before)

    win.resolve()
    const success = events.find((e) => e.getType() === GameEventType.RollSuccess)!
    expect(success.getPayload()).toMatchObject({ cardId: 'hero-1', ctxSeed: { [CTX_CHOSEN_PLAYER]: ['p2'] } })
  })

  // Fluffy names two heroes under one roll: both seats have to know they are
  // targeted, and both slots have to reach the effect when the roll lands.
  it('keeps every target it is given, one per slot, and seeds them all', () => {
    const win = makeWindow({ gs, em, baseRoll: 5, rollReq: 5 })

    win.targetChosen(CTX_CHOSEN_CARD, ['their-card'], Zone.Party)
    win.targetChosen('second', ['p1'], Zone.Party)

    expect(win.getDetail()['targets']).toEqual([
      { playerId: 'p2', zone: Zone.Party },
      { playerId: 'p1', zone: Zone.Party },
    ])

    // choosing into the SAME slot again replaces that one and nothing else
    win.targetChosen('second', ['p2'], Zone.Party)
    expect(win.getDetail()['targets']).toEqual([{ playerId: 'p2', zone: Zone.Party }])

    win.resolve()
    const success = events.find((e) => e.getType() === GameEventType.RollSuccess)!
    expect(success.getPayload()).toMatchObject({
      ctxSeed: { [CTX_CHOSEN_CARD]: ['their-card'], second: ['p2'] },
    })
  })

  it("a card picked from a hand is shown as its owner's seat, never as the card", () => {
    const win = makeWindow({ gs, em, baseRoll: 5, rollReq: 5 })
    win.targetChosen(CTX_CHOSEN_CARD, ['their-card'], Zone.Hand)
    expect(win.getDetail()['targets']).toEqual([{ playerId: 'p2', zone: Zone.Hand }])
    expect(JSON.stringify(win.getDetail())).not.toContain('their-card')
  })

  it('does not settle while a question stands over it; the clock runs again instead', () => {
    const win = makeWindow({ gs, em, baseRoll: 5, rollReq: 5 })
    gs.addFrame('frame-2', gs.clone(), [])
    const question = new PlayerChoiceWindow('w-q', 'p1', ['p2'], 60_000, gs, 'frame-2', em)
    gs.addWindow('frame-2', question)

    jest.advanceTimersByTime(5000)
    expect(win.isOpen()).toBe(true)
    win.resolve()
    expect(win.isOpen()).toBe(true)

    question.submitReaction('p1', { choice: 'p2' })
    jest.advanceTimersByTime(5000)
    expect(win.isOpen()).toBe(false)
  })

  it('a modifier landing gives the question standing over the roll its clock back; the roll running out does not', () => {
    const win = makeWindow({ gs, em, baseRoll: 5, rollReq: 5, timeoutMs: 5000 })
    gs.addFrame('frame-2', gs.clone(), [])
    const question = new PlayerChoiceWindow('w-q', 'p1', ['p2'], 5000, gs, 'frame-2', em)
    gs.addWindow('frame-2', question)
    const asked = question.getDeadline()

    jest.advanceTimersByTime(3000)
    win.submitReaction('p2', { value: -2, cardId: 'mod-1' })
    expect(question.getDeadline()).toBe(asked + 3000)
    expect(win.getDeadline()).toBe(asked + 3000)

    // the roll's own clock running out only restarts the roll
    jest.advanceTimersByTime(4999)
    expect(win.isOpen()).toBe(true)
    expect(question.isOpen()).toBe(true)
    expect(question.getDeadline()).toBe(asked + 3000)
  })

  it('any number of cards may follow the first: the roll stays open, each giving the full wait again', () => {
    const win = makeWindow({ gs, em, baseRoll: 2, rollReq: 5 })
    win.submitReaction('p2', { value: 1, cardId: 'mod-1' })
    win.submitReaction('p1', { value: 2, cardId: 'mod-2' })
    win.submitReaction('p2', { value: -2, cardId: 'mod-1' })
    expect(win.isOpen()).toBe(true)
    expect(win.getFinalRoll()).toBe(3)

    win.targetChosen(CTX_CHOSEN_PLAYER, ['p2'], Zone.Hand)
    expect(win.isOpen()).toBe(true)
  })
})

describe('ModifierWindow — every modifier gives the table the full wait again', () => {
  it("the spend and the landing each restart the clock at the window's own timeout", () => {
    jest.useFakeTimers()
    try {
      const gs = makeGs()
      const em = new GameEventEmitter()
      const win = makeWindow({ gs, em, timeoutMs: 5000 })
      const opened = win.getDeadline()

      jest.advanceTimersByTime(3000)
      win.cardSpent()
      expect(win.getDeadline()).toBe(opened + 3000)

      jest.advanceTimersByTime(2000)
      win.submitReaction('p2', { value: 2, cardId: 'mod-x' })
      expect(win.getDeadline()).toBe(opened + 5000)
      expect(win.isOpen()).toBe(true)

      jest.advanceTimersByTime(4999)
      expect(win.isOpen()).toBe(true)
      jest.advanceTimersByTime(1)
      expect(win.isOpen()).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })
})
