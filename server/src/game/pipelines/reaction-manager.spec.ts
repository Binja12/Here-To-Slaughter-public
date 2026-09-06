import { ReactionType, ReactionWindowType, RefusalReason, RequestResult } from 'shared'
import { ReactionManager } from './reaction-manager'
import { GameState } from './game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { accepted, IReaction, IReactionWindow, refused } from '../interfaces'
import { NO_CONTEXT_RESULT } from '../abilities/ability-context'

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
  canExecute: () =>
    canExecute ? accepted() : refused(RefusalReason.CardNotInHand),
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

    it('creates the frame in gs.getFrames()', () => {
      const id = rm.openFrame()
      expect(gs.getFrames().has(id)).toBe(true)
    })

    it('snapshot is captured at open time — later mutations do not affect it', () => {
      const id = rm.openFrame()
      gs.markAbilityUsed('hero-x')
      const snap = gs.getFrames().get(id)!.snapshot
      expect(snap.getAbilitiesUsedThisTurn()).not.toContain('hero-x')
    })

    it('frame starts with no windows', () => {
      const id = rm.openFrame()
      expect(gs.getFrames().get(id)!.windows).toHaveLength(0)
    })

    it('returns a fresh id each time, and holds no state about it', () => {
      const a = rm.openFrame()
      const b = rm.openFrame()
      expect(a).not.toBe(b)
      expect(gs.getFrames().has(a)).toBe(true)
      expect(gs.getFrames().has(b)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // openWindow
  // ---------------------------------------------------------------------------

  describe('pass — a seat giving a table window up', () => {
    it.each([ReactionWindowType.Modifier, ReactionWindowType.Challenge])(
      'reopens all four votes when the last player modifies a %s window', (type) => {
        for (const id of ['p3', 'p4']) {
          gs.registerPlayer(makePlayer(id))
          gs.registerParty(makeParty(id))
        }
        const frameId = rm.openFrame()
        rm.openWindow(frameId, type, 'p1', {
          baseRoll: 5, rollReq: 7, heroId: 'hero-1', cardId: 'hero-1',
        })
        const window = gs.getFrames().get(frameId)!.windows[0]
        if (type === ReactionWindowType.Challenge) {
          window.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
        }
        for (const id of ['p1', 'p2', 'p3']) rm.pass(window.getId(), id)
        expect(window.isOpen()).toBe(true)
        window.submitReaction('p4', { type: 'modifier', targetPlayerId: 'p1', value: 2, cardId: 'mod' })
        expect(window.getDetail()['passedBy']).toEqual([])
        for (const id of ['p1', 'p2', 'p3']) rm.pass(window.getId(), id)
        expect(window.isOpen()).toBe(true)
        rm.pass(window.getId(), 'p4')
        expect(window.isOpen()).toBe(false)
      },
    )
    const openRoll = () => {
      const frameId = rm.openFrame()
      rm.openWindow(frameId, ReactionWindowType.Modifier, 'p1', {
        baseRoll: 5,
        rollReq: 7,
        heroId: 'hero-1',
      })
      return gs.getFrames().get(frameId)!.windows[0]
    }

    beforeEach(() => {
      gs.registerPlayer(makePlayer('p2'))
      gs.registerParty(makeParty('p2'))
    })

    it('one seat passing leaves the roll open, and the table sees who passed', () => {
      const window = openRoll()
      expect(rm.pass(window.getId(), 'p1')).toEqual({ accepted: true })
      expect(window.isOpen()).toBe(true)
      expect(window.getDetail()['passedBy']).toEqual(['p1'])
    })

    it('settles once every seat has passed, as the clock would', () => {
      const window = openRoll()
      rm.pass(window.getId(), 'p1')
      rm.pass(window.getId(), 'p2')
      expect(window.isOpen()).toBe(false)
    })

    it('a card landing in the roll clears the passes — everyone looks again', () => {
      const window = openRoll()
      rm.pass(window.getId(), 'p1')
      ;(window as any).cardSpent()
      expect(window.getDetail()['passedBy']).toEqual([])
      expect(window.isOpen()).toBe(true)
    })

    it('an unstarted challenge waits for everyone but the defender', () => {
      const frameId = rm.openFrame()
      rm.openWindow(frameId, ReactionWindowType.Challenge, 'p1', { cardId: 'hero-1' })
      const window = gs.getFrames().get(frameId)!.windows[0]
      rm.pass(window.getId(), 'p2')
      expect(window.isOpen()).toBe(false)
    })

    it('NoSuchWindow once it has resolved', () => {
      const window = openRoll()
      rm.pass(window.getId(), 'p1')
      rm.pass(window.getId(), 'p2')
      expect(rm.pass(window.getId(), 'p1')).toEqual({
        accepted: false,
        reason: RefusalReason.NoSuchWindow,
      })
    })

    it("WindowNotPassable for a choice — one player's question", () => {
      const frameId = rm.openFrame()
      rm.openWindow(frameId, ReactionWindowType.PlayerChoice, 'p1', { options: ['p1'] })
      const window = gs.getFrames().get(frameId)!.windows[0]
      expect(rm.pass(window.getId(), 'p1')).toEqual({
        accepted: false,
        reason: RefusalReason.WindowNotPassable,
      })
    })
  })

  describe('openWindow', () => {
    it('inserts a ModifierWindow with the correct type', () => {
      const frameId = rm.openFrame()
      rm.openWindow(frameId, ReactionWindowType.Modifier, 'p1', {
        baseRoll: 5,
        rollReq: 7,
        heroId: 'hero-1',
      })
      const windows = gs.getFrames().get(frameId)!.windows
      expect(windows).toHaveLength(1)
      expect(windows[0].getType()).toBe(ReactionWindowType.Modifier)
    })

    it('inserts a ChallengeWindow with the correct type', () => {
      const frameId = rm.openFrame()
      rm.openWindow(frameId, ReactionWindowType.Challenge, 'p1', {
        cardId: 'hero-1',
      })
      const windows = gs.getFrames().get(frameId)!.windows
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
      expect(gs.getFrames().get(frameId)!.windows).toHaveLength(2)
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
    it('calls execute when canExecute returns true, and says so', () => {
      const executeSpy = jest.fn()
      const result = rm.submitReaction(
        makeStubReaction({ canExecute: true, execute: executeSpy }),
      )
      expect(result).toEqual({ accepted: true })
      expect(executeSpy).toHaveBeenCalledTimes(1)
    })

    it('passes gs and em to execute', () => {
      const executeSpy = jest.fn()
      rm.submitReaction(makeStubReaction({ canExecute: true, execute: executeSpy }))
      expect(executeSpy).toHaveBeenCalledWith(gs, em)
    })

    it('returns the reaction\'s own refusal when canExecute says no', () => {
      const executeSpy = jest.fn()
      const result = rm.submitReaction(
        makeStubReaction({ canExecute: false, execute: executeSpy }),
      )
      expect(result).toEqual({ accepted: false, reason: RefusalReason.CardNotInHand })
      expect(executeSpy).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // submitChoice — three lines and no rules of its own: it finds the window
  // and hands back whatever the window made of the pick.
  // ---------------------------------------------------------------------------
  describe('submitChoice', () => {
    /** A window that answers every submission with `verdict`. */
    const stubWindow = (
      id: string,
      open: boolean,
      verdict: RequestResult,
    ): IReactionWindow & { submitReaction: jest.Mock } => ({
      getId: () => id,
      getType: () => ReactionWindowType.CardChoice,
      getRespondentId: () => 'p1',
      isOptional: () => false,
      getOptions: () => ['a'],
      isOpen: () => open,
      submitReaction: jest.fn(() => verdict),
      resolve: () => {},
      cancel: () => {},
      resultKey: () => NO_CONTEXT_RESULT,
      getDetail: () => ({}),
      getDeadline: () => 0,
    })

    it('refuses a window id nothing is open under', () => {
      expect(rm.submitChoice('no-such-window', 'p1', 'a')).toEqual({
        accepted: false,
        reason: RefusalReason.NoSuchWindow,
      })
    })

    it('refuses a window that has already lapsed, without asking it', () => {
      const lapsed = stubWindow('w1', false, { accepted: true })
      gs.addFrame('f1', gs.clone(), [lapsed])

      expect(rm.submitChoice('w1', 'p1', 'a')).toEqual({
        accepted: false,
        reason: RefusalReason.NoSuchWindow,
      })
      expect(lapsed.submitReaction).not.toHaveBeenCalled()
    })

    it('hands the pick to the open window and returns its verdict unchanged', () => {
      const verdict: RequestResult = {
        accepted: false,
        reason: RefusalReason.NotAnOption,
      }
      const open = stubWindow('w1', true, verdict)
      gs.addFrame('f1', gs.clone(), [open])

      expect(rm.submitChoice('w1', 'p1', 'a')).toBe(verdict)
      expect(open.submitReaction).toHaveBeenCalledWith('p1', { choice: 'a' })
    })
  })
})

describe('ReactionManager — each window takes its share of the countdown', () => {
  it('an attack waits twice as long as a challenge; a hero roll the same as a challenge', () => {
    jest.useFakeTimers()
    const gs = makeGs()
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em, 1_000)
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1'))
    const now = Date.now()

    const wait = (type: ReactionWindowType, config: Record<string, unknown>) => {
      const frameId = rm.openFrame()
      rm.openWindow(frameId, type, 'p1', config)
      return gs.getFrames().get(frameId)!.windows[0].getDeadline() - now
    }

    expect(wait(ReactionWindowType.Challenge, { cardId: 'hero-1' })).toBe(1_000)
    expect(wait(ReactionWindowType.Modifier, { baseRoll: 5, rollReq: 7, heroId: 'hero-1' })).toBe(1_000)
    expect(wait(ReactionWindowType.Attack, { baseRoll: 5, monsterId: 'monster-1' })).toBe(2_000)
    expect(wait(ReactionWindowType.PlayerChoice, { options: ['p1'] })).toBe(1_000)
    jest.useRealTimers()
  })
})
