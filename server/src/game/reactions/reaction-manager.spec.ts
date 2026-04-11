import { ReactionType, ReactionWindowType } from 'shared'
import { ReactionManager } from './reaction-manager'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { IReaction } from '../interfaces'

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

const makePlayer = (id: string) =>
  new Player({ id, name: id, hand: [], partyId: `${id}-party`, actionPoints: 3 })

const makeParty = (playerId: string) =>
  new Party({ playerId, leaderId: `${playerId}-leader`, heroIds: [], monsterIds: [] })

/** Stub IReaction whose canExecute and execute are jest spies. */
const makeStubReaction = ({
  canExecute = true,
  execute = jest.fn(),
}: { canExecute?: boolean; execute?: jest.Mock } = {}): IReaction => ({
  getId: () => 'r1',
  getType: () => ReactionType.ApplyModifier,
  getPlayerId: () => 'p1',
  canExecute: () => canExecute,
  execute,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReactionManager', () => {
  let gs: GameState
  let em: GameEventEmitter
  let rm: ReactionManager

  beforeEach(() => {
    jest.useFakeTimers()
    gs = makeGs()
    em = new GameEventEmitter()
    rm = new ReactionManager(gs, em)
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1'))
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // openFrame
  // ---------------------------------------------------------------------------

  describe('openFrame', () => {
    it('returns a non-empty frame id', () => {
      const id = rm.openFrame()
      expect(id).toBeTruthy()
    })

    it('creates the frame in gs.frames', () => {
      const id = rm.openFrame()
      expect(gs.frames.has(id)).toBe(true)
    })

    it('snapshot is captured at open time — later mutations do not affect it', () => {
      const id = rm.openFrame()
      gs.markAbilityUsed('hero-x')
      const snap = gs.frames.get(id)!.snapshot
      expect(snap.getAbilitiesUsedThisTurn()).not.toContain('hero-x')
    })

    it('frame starts with no windows', () => {
      const id = rm.openFrame()
      expect(gs.frames.get(id)!.windows).toHaveLength(0)
    })

    it('sets takeLastFrameId to the new frame id', () => {
      const id = rm.openFrame()
      expect(rm.takeLastFrameId()).toBe(id)
    })
  })

  // ---------------------------------------------------------------------------
  // takeLastFrameId
  // ---------------------------------------------------------------------------

  describe('takeLastFrameId', () => {
    it('returns null before any frame has been opened', () => {
      expect(rm.takeLastFrameId()).toBeNull()
    })

    it('clears the id after the first call', () => {
      rm.openFrame()
      rm.takeLastFrameId()
      expect(rm.takeLastFrameId()).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // openWindow
  // ---------------------------------------------------------------------------

  describe('openWindow', () => {
    it('inserts a ModifierWindow with the correct type', () => {
      const frameId = rm.openFrame()
      rm.openWindow(frameId, ReactionWindowType.Modifier, 'p1', {
        baseRoll: 5,
        rollReq: 7,
        heroId: 'hero-1',
      })
      const windows = gs.frames.get(frameId)!.windows
      expect(windows).toHaveLength(1)
      expect(windows[0].getType()).toBe(ReactionWindowType.Modifier)
    })

    it('inserts a ChallengeWindow with the correct type', () => {
      const frameId = rm.openFrame()
      rm.openWindow(frameId, ReactionWindowType.Challenge, 'p1', {
        cardId: 'hero-1',
      })
      const windows = gs.frames.get(frameId)!.windows
      expect(windows).toHaveLength(1)
      expect(windows[0].getType()).toBe(ReactionWindowType.Challenge)
    })

    it('multiple windows can be added to the same frame', () => {
      const frameId = rm.openFrame()
      rm.openWindow(frameId, ReactionWindowType.Modifier, 'p1', {
        baseRoll: 3,
        rollReq: 5,
        heroId: 'hero-1',
      })
      rm.openWindow(frameId, ReactionWindowType.Modifier, 'p1', {
        baseRoll: 4,
        rollReq: 6,
        heroId: 'hero-2',
      })
      expect(gs.frames.get(frameId)!.windows).toHaveLength(2)
    })

    it('does nothing when the frame id does not exist', () => {
      expect(() =>
        rm.openWindow('no-such-frame', ReactionWindowType.Modifier, 'p1', {
          baseRoll: 3,
          rollReq: 5,
          heroId: 'hero-1',
        }),
      ).not.toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // submitReaction
  // ---------------------------------------------------------------------------

  describe('submitReaction', () => {
    it('calls execute when canExecute returns true', () => {
      const executeSpy = jest.fn()
      rm.submitReaction(makeStubReaction({ canExecute: true, execute: executeSpy }))
      expect(executeSpy).toHaveBeenCalledTimes(1)
    })

    it('passes gs and em to execute', () => {
      const executeSpy = jest.fn()
      rm.submitReaction(makeStubReaction({ canExecute: true, execute: executeSpy }))
      expect(executeSpy).toHaveBeenCalledWith(gs, em)
    })

    it('does not call execute when canExecute returns false', () => {
      const executeSpy = jest.fn()
      rm.submitReaction(makeStubReaction({ canExecute: false, execute: executeSpy }))
      expect(executeSpy).not.toHaveBeenCalled()
    })
  })
})
