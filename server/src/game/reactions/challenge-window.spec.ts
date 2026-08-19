import { GameEventType, IGameEvent, PassiveType, ReactionWindowType } from 'shared'
import { Player } from '../player'
import { Party } from '../party'
import { ChallengeWindow } from './challenge-window'
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
 * Build a ChallengeWindow then register its frame.
 * Construction fires immediately (emits CardPlayAttempted + starts timer),
 * so the frame is added afterwards.
 */
function makeWindow({
  gs,
  em,
  id = 'win-1',
  challengedId = 'p1',
  cardId = 'hero-1',
  timeoutMs = 5000,
  frameId = 'frame-1',
}: {
  gs: GameState
  em: GameEventEmitter
  id?: string
  challengedId?: string
  cardId?: string
  timeoutMs?: number
  frameId?: string
}): ChallengeWindow {
  const win = new ChallengeWindow(id, challengedId, cardId, timeoutMs, gs, frameId, em)
  gs.addFrame(frameId, { snapshot: gs.clone(), windows: [win] })
  return win
}

// Math.random mock guide for challenge:
//   roll = Math.floor(Math.random() * 11) + 1  → range [1, 11]
//   Math.random() = 0    → floor(0)    + 1 = 1
//   Math.random() = 0.99 → floor(10.89)+ 1 = 11
//   Math.random() = 0.5  → floor(5.5)  + 1 = 6
//
// startChallenge calls Math.random() twice:
//   first  → challengerRoll
//   second → defenderRoll

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChallengeWindow — standing roll bonuses', () => {
  let gs: GameState
  let em: GameEventEmitter
  let events: IGameEvent[]

  const seat = (id: string) => {
    gs.registerPlayer(
      new Player({ id, name: id, hand: [], partyId: id + '-p', actionPoints: 3 }),
    )
    gs.registerParty(
      new Party({ playerId: id, leaderId: id + '-l', heroIds: [], monsterIds: [] }),
    )
  }

  const giveRollBonus = (playerId: string, sourceCardId: string, value: number) =>
    gs.addEffect({
      id: 'eff-' + playerId,
      sourceCardId,
      ownerId: playerId,
      type: PassiveType.RollBonus,
      value,
    })

  beforeEach(() => {
    jest.useFakeTimers()
    gs = makeGs()
    em = new GameEventEmitter()
    events = collect(em)
    seat('p1') // challenged
    seat('p2') // challenger
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const resolved = () =>
    events
      .find((e) => e.getType() === GameEventType.ChallengeResolved)!
      .getPayload() as Record<string, unknown>

  it("a challenged player's +3 counts toward their challenge roll", () => {
    giveRollBonus('p1', 'hero-028', 3)
    const win = makeWindow({ gs, em, challengedId: 'p1' })

    // challenger 6, challenged 5 — challenged loses on the dice alone...
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.4)
    win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
    win.resolve()

    // ...but 5 + 3 = 8 beats 6.
    expect(resolved()).toMatchObject({ challengerFinal: 6, defenderFinal: 8 })
  })

  it("a challenger's own bonus counts toward THEIR roll", () => {
    giveRollBonus('p2', 'hero-028', 3)
    const win = makeWindow({ gs, em, challengedId: 'p1' })

    jest.spyOn(Math, 'random').mockReturnValueOnce(0.4).mockReturnValueOnce(0.5)
    win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
    win.resolve()

    expect(resolved()).toMatchObject({ challengerFinal: 8, defenderFinal: 6 })
  })

  it('ChallengeStarted carries each side opening bonuses, with sources', () => {
    giveRollBonus('p1', 'hero-028', 3)
    const win = makeWindow({ gs, em, challengedId: 'p1' })

    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })

    const started = events
      .find((e) => e.getType() === GameEventType.ChallengeStarted)!
      .getPayload() as Record<string, unknown>
    expect(started['challengerBonuses']).toEqual([])
    expect(started['defenderBonuses']).toEqual([
      { cardSource: 'hero-028', amount: 3 },
    ])
  })

  it('a modifier naming neither side of the challenge is ignored', () => {
    const win = makeWindow({ gs, em, challengedId: 'p1' })
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
    win.submitReaction('p3', {
      type: 'modifier',
      value: 9,
      cardId: 'mod-x',
      targetPlayerId: 'p3',
    })
    win.resolve()

    expect(resolved()).toMatchObject({ challengerFinal: 6, defenderFinal: 6 })
  })
})

describe('ChallengeWindow', () => {
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
  it('emits ReactionWindowOpened tagged as a Challenge window', () => {
    makeWindow({ gs, em, challengedId: 'p1', cardId: 'hero-1' })
    const e = events.find((e) => e.getType() === GameEventType.ReactionWindowOpened)
    expect(e).toBeDefined()
    expect((e!.getPayload() as any).windowType).toBe(ReactionWindowType.Challenge)
  })

  // The contested card rides in the same event, so collapsing the bespoke
  // ChallengeWindowOpened lost the client nothing.
  it('carries the contested card on ReactionWindowOpened', () => {
    makeWindow({ gs, em, challengedId: 'p1', cardId: 'hero-1' })
    const e = events.find((e) => e.getType() === GameEventType.ReactionWindowOpened)
    expect(e!.getPlayerId()).toBe('p1')
    expect((e!.getPayload() as any).cardId).toBe('hero-1')
    expect((e!.getPayload() as any).defenderId).toBe('p1')
  })

  it('getType() returns Challenge', () => {
    expect(makeWindow({ gs, em }).getType()).toBe(ReactionWindowType.Challenge)
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
  // resolve() — uncontested (no challenger)
  // ---------------------------------------------------------------------------

  describe('resolve() uncontested', () => {
    it('emits ReactionWindowClosed with a winning outcome', () => {
      const win = makeWindow({ gs, em })
      win.resolve()
      const e = events.find((e) => e.getType() === GameEventType.ReactionWindowClosed)
      expect(e).toBeDefined()
      expect((e!.getPayload() as any).outcome).toBe(true)
    })

    it('emits FrameResolved', () => {
      const win = makeWindow({ gs, em })
      win.resolve()
      expect(events.some((e) => e.getType() === GameEventType.FrameResolved)).toBe(true)
    })

    it('releases frame (frame absent from gs.frames)', () => {
      const win = makeWindow({ gs, em, frameId: 'f-uncontested' })
      win.resolve()
      expect(gs.frames.has('f-uncontested')).toBe(false)
    })

    it('does NOT emit ChallengeResolved', () => {
      const win = makeWindow({ gs, em })
      win.resolve()
      expect(events.some((e) => e.getType() === GameEventType.ChallengeResolved)).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // submitReaction — starting a challenge
  // ---------------------------------------------------------------------------

  describe('submitReaction challenge', () => {
    it('emits ChallengeStarted when a challenge is submitted', () => {
      const win = makeWindow({ gs, em })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      expect(events.some((e) => e.getType() === GameEventType.ChallengeStarted)).toBe(true)
    })

    it('ChallengeStarted payload includes both rolls', () => {
      jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99)
      const win = makeWindow({ gs, em })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      const e = events.find((e) => e.getType() === GameEventType.ChallengeStarted)
      expect(e!.getPayload()).toMatchObject({ challengerRoll: 1, defenderRoll: 11 })
    })

    it('second challenge submission is ignored (no duplicate)', () => {
      const win = makeWindow({ gs, em })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.submitReaction('p3', { type: 'challenge', challengerId: 'p3' })
      const count = events.filter((e) => e.getType() === GameEventType.ChallengeStarted).length
      expect(count).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // submitReaction — modifiers
  // ---------------------------------------------------------------------------

  describe('submitReaction modifier', () => {
    it('modifier before challenge starts is ignored (no ModifierApplied emitted)', () => {
      const win = makeWindow({ gs, em })
      win.submitReaction('p3', { type: 'modifier', value: 3, targetPlayerId: 'p2' })
      expect(events.some((e) => e.getType() === GameEventType.ModifierApplied)).toBe(false)
    })

    it('emits ModifierApplied when bonus targets the challenger', () => {
      const win = makeWindow({ gs, em, challengedId: 'p1' })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.submitReaction('p3', { type: 'modifier', value: 2, targetPlayerId: 'p2' })
      const e = events.find((e) => e.getType() === GameEventType.ModifierApplied)
      expect(e).toBeDefined()
      expect((e!.getPayload() as any).value).toBe(2)
    })

    it('emits ModifierApplied when bonus targets the defender', () => {
      const win = makeWindow({ gs, em, challengedId: 'p1' })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.submitReaction('p3', { type: 'modifier', value: 3, targetPlayerId: 'p1' })
      const e = events.find((e) => e.getType() === GameEventType.ModifierApplied)
      expect(e).toBeDefined()
      expect((e!.getPayload() as any).value).toBe(3)
    })

    it('ModifierApplied payload reflects running totals after multiple bonuses', () => {
      jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0) // both = 1
      const win = makeWindow({ gs, em, challengedId: 'p1' })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.submitReaction('p3', { type: 'modifier', value: 2, targetPlayerId: 'p2' }) // challenger: 1+2=3
      win.submitReaction('p3', { type: 'modifier', value: 4, targetPlayerId: 'p1' }) // defender: 1+4=5
      const modEvents = events.filter((e) => e.getType() === GameEventType.ModifierApplied)
      expect(modEvents).toHaveLength(2)
      expect((modEvents[1].getPayload() as any).defenderTotal).toBe(5)
      expect((modEvents[1].getPayload() as any).challengerTotal).toBe(3)
    })
  })

  // ---------------------------------------------------------------------------
  // resolve() — defender wins (challengedFinal > challengerFinal)
  // ---------------------------------------------------------------------------

  describe('resolve() contested — defender wins', () => {
    // challenger=1 (random=0), defender=11 (random=0.99) → defender wins → release frame

    beforeEach(() => {
      jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99)
    })

    it('emits ChallengeResolved', () => {
      const win = makeWindow({ gs, em })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
      expect(events.some((e) => e.getType() === GameEventType.ChallengeResolved)).toBe(true)
    })

    it('ChallengeResolved payload has defenderWins=true', () => {
      const win = makeWindow({ gs, em })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
      const e = events.find((e) => e.getType() === GameEventType.ChallengeResolved)
      expect((e!.getPayload() as any).defenderWins).toBe(true)
    })

    it('releases frame', () => {
      const win = makeWindow({ gs, em, frameId: 'f-def-wins' })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
      expect(gs.frames.has('f-def-wins')).toBe(false)
    })

    it('emits FrameResolved', () => {
      const win = makeWindow({ gs, em })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
      expect(events.some((e) => e.getType() === GameEventType.FrameResolved)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // resolve() — challenger wins (challengerFinal > challengedFinal)
  // ---------------------------------------------------------------------------

  describe('resolve() contested — challenger wins', () => {
    // challenger=11 (random=0.99), defender=1 (random=0) → challenger wins → restore frame

    beforeEach(() => {
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0)
    })

    it('emits ChallengeResolved', () => {
      const win = makeWindow({ gs, em })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
      expect(events.some((e) => e.getType() === GameEventType.ChallengeResolved)).toBe(true)
    })

    it('ChallengeResolved payload has defenderWins=false', () => {
      const win = makeWindow({ gs, em })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
      const e = events.find((e) => e.getType() === GameEventType.ChallengeResolved)
      expect((e!.getPayload() as any).defenderWins).toBe(false)
    })

    it('restores frame — state mutations after snapshot are undone', () => {
      const win = makeWindow({ gs, em, frameId: 'f-chal-wins' })
      gs.markAbilityUsed('some-hero') // mutate after snapshot
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
      expect(gs.getAbilitiesUsedThisTurn()).not.toContain('some-hero')
    })

    it('frame is absent from gs.frames after restoreFrame', () => {
      const win = makeWindow({ gs, em, frameId: 'f-chal-wins' })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
      expect(gs.frames.has('f-chal-wins')).toBe(false)
    })

    it('emits FrameResolved', () => {
      const win = makeWindow({ gs, em })
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
      expect(events.some((e) => e.getType() === GameEventType.FrameResolved)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // resolve() — tie (equal scores → challenger wins → restore frame)
  // ---------------------------------------------------------------------------

  it('tie: challenger wins (challengedFinal not > challengerFinal) — restores frame', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.5) // both = 6
    const win = makeWindow({ gs, em, frameId: 'f-tie' })
    gs.markAbilityUsed('some-hero')
    win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
    win.resolve()
    expect(gs.getAbilitiesUsedThisTurn()).not.toContain('some-hero')
    expect(gs.frames.has('f-tie')).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Modifier swings outcome
  // ---------------------------------------------------------------------------

  it('modifier on defender can swing outcome from challenger-wins to defender-wins', () => {
    // challenger=11 (random=0.99), defender=1 (random=0) → base: challenger wins
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0)
    const win = makeWindow({ gs, em, challengedId: 'p1', frameId: 'f-swing' })
    win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
    // +11 on defender → defenderFinal=12 > challengerFinal=11 → defender wins → release
    win.submitReaction('p3', { type: 'modifier', value: 11, targetPlayerId: 'p1' })
    win.resolve()
    const e = events.find((e) => e.getType() === GameEventType.ChallengeResolved)
    expect((e!.getPayload() as any).defenderWins).toBe(true)
    expect(gs.frames.has('f-swing')).toBe(false) // released
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
    const win = makeWindow({ gs, em })
    win.resolve()
    win.resolve()
    const count = (type: GameEventType) => events.filter((e) => e.getType() === type).length
    expect(count(GameEventType.ReactionWindowClosed)).toBe(1)
    expect(count(GameEventType.FrameResolved)).toBe(1)
  })

  it('timer is cancelled when resolve() is called before timeout', () => {
    const win = makeWindow({ gs, em, timeoutMs: 3000 })
    win.resolve()
    // Advance past the original timeout — should not trigger a second resolve
    jest.runAllTimers()
    const count = events.filter((e) => e.getType() === GameEventType.ReactionWindowClosed).length
    expect(count).toBe(1)
  })
})
