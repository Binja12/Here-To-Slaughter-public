import { ActionType, GameEventType, GamePhase, IGameEvent, ReactionWindowType, RefusalReason, TurnPhase } from 'shared'
import { TurnManager } from './turn-manager'
import { GameState } from './game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { accepted, IAction, IReactionWindow, refused } from '../interfaces'
import { CardPile } from '../state-structures/card-pile'
import {
  AbilityContext,
  NO_CONTEXT_RESULT,
} from '../abilities/ability-context'

const makeGs = (actionPoints = 3, seamless = false) => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discardPile = new CardPile('discard pile', 'discard pile')
  const monsterDeck = new CardStack('monster deck', 'main monster deck')
  const monsterPile = new CardPile('slayable monsters', 'monster pile')
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [],
    partyId: 'party-1',
    actionPoints,
  })
  const party = new Party({
    playerId: 'p1',
    leaderId: 'leader-1',
    heroIds: [],
    monsterIds: [],
  })

  const gs = new GameState(deck, discardPile, monsterDeck, monsterPile, seamless)
  gs.registerPlayer(player)
  gs.registerParty(party)
  return gs
}

/**
 * Realistic mock action: canExecute checks player AP, execute deducts it.
 * This mirrors how real actions behave so TurnManager tests stay accurate.
 */
const makeAction = (
  cost: number,
  canExecBase = true,
  events: IGameEvent[] = [],
): IAction => ({
  getId: () => 'test-action',
  getType: () => ActionType.DrawCard,
  getPlayerId: () => 'p1',
  getCost: () => cost,
  isReactable: () => false,
  canExecute: (gs: GameState) => {
    if (!canExecBase) return refused(RefusalReason.NoActionPoints)
    const player = gs.getPlayer('p1')
    return player && player.getActionPoints() >= cost
      ? accepted()
      : refused(RefusalReason.NoActionPoints)
  },
  execute: (gs: GameState) => {
    gs.getPlayer('p1')?.decreaseActionPoints(cost)
    return events
  },
})

describe('TurnManager', () => {
  describe('startTurn()', () => {
    it('should set current player', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      expect(gs.getCurrentPlayerId()).toBe('p1')
    })

    it('should set phase to ActionWindow', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      expect(tm.getPhase()).toBe(TurnPhase.Action)
    })

    it('should reset action points from player', () => {
      const gs = makeGs(3)
      // Simulate previous turn spending
      gs.getPlayer('p1')!.decreaseActionPoints(2)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      expect(gs.getActionPoints('p1')).toBe(3)
    })

    it('should clear cards challenged in the previous turn', () => {
      const gs = makeGs()
      gs.markCardChallenged('hero-1')
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      // Without this the once-per-turn challenge guard hardens into a permanent
      // ban on every card that ever survived a challenge.
      expect(gs.getCardsChallengedThisTurn()).toHaveLength(0)
    })

    it('should clear abilities used from previous turn', () => {
      const gs = makeGs()
      gs.markAbilityUsed('hero-1')
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      expect(gs.getAbilitiesUsedThisTurn()).toHaveLength(0)
    })

    it('should emit TurnStarted event', () => {
      const gs = makeGs()
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')
      expect(
        received.some((e) => e.getType() === GameEventType.TurnStarted),
      ).toBe(true)
    })

    it('should do nothing for unknown player', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('unknown')
      expect(gs.getCurrentPlayerId()).toBeUndefined()
    })
  })

  describe('enqueue()', () => {
    it('throws before the first turn — an engine mistake, not a refusal', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      const executed: boolean[] = []
      const action = makeAction(1)
      action.execute = () => {
        executed.push(true)
        return []
      }
      // Not started: the transport routed input to a table it never opened.
      expect(() => tm.enqueue(action)).toThrow(/outside the action phase/)
      expect(executed).toHaveLength(0)
    })

    it('refuses every request once the game has ended', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      // GameEngine concludes the BOARD when a winner is found; the drain
      // reads it there rather than inferring it from its own phase.
      gs.setGamePhase(GamePhase.Concluded)

      const executed: boolean[] = []
      const action = makeAction(1)
      action.execute = () => {
        executed.push(true)
        return []
      }

      expect(tm.enqueue(action)).toEqual({
        accepted: false,
        reason: RefusalReason.GameOver,
      })
      expect(executed).toHaveLength(0)
    })

    it('should ignore an action from a player whose turn it is not', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      const executed: boolean[] = []
      // Same seat's own budget, and still refused: action points are spent on
      // YOUR turn, and everybody else answers with reactions.
      const action = { ...makeAction(1), getPlayerId: () => 'p2' }
      action.execute = () => {
        executed.push(true)
        return []
      }
      const result = tm.enqueue(action)

      expect(result).toEqual({ accepted: false, reason: RefusalReason.NotYourTurn })
      expect(executed).toHaveLength(0)
      expect(tm.getQueuedActions()).toHaveLength(0)
      expect(gs.getActionPoints('p1')).toBe(3)
    })

    it('should execute a valid action', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      const executed: boolean[] = []
      const action = makeAction(1)
      action.execute = (g) => {
        gs.getPlayer('p1')?.decreaseActionPoints(1)
        executed.push(true)
        return []
      }
      const result = tm.enqueue(action)

      expect(result).toEqual({ accepted: true })
      expect(executed).toHaveLength(1)
    })

    it('should deduct action points after execution', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      tm.enqueue(makeAction(2))
      expect(gs.getActionPoints('p1')).toBe(1)
    })

    it('should skip actions when canExecute returns false (e.g. cost exceeds AP)', () => {
      const gs = makeGs(1)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      // cost-2 action → canExecute checks player AP (1) < 2 → returns false → skipped
      const executed: boolean[] = []
      const expensive = makeAction(2)
      const origExecute = expensive.execute
      expensive.execute = (g) => {
        executed.push(true)
        return origExecute(g)
      }
      const result = tm.enqueue(expensive)

      expect(result).toEqual({ accepted: false, reason: RefusalReason.NoActionPoints })
      expect(executed).toHaveLength(0)
      expect(tm.getPhase()).toBe(TurnPhase.Action) // turn not ended, just skipped
      expect(gs.getActionPoints('p1')).toBe(1)
    })

    it('should skip actions whose canExecute explicitly returns false', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      const executed: boolean[] = []
      const blocked = makeAction(1, false)
      blocked.execute = () => {
        executed.push(true)
        return []
      }
      const result = tm.enqueue(blocked)

      expect(result).toEqual({ accepted: false, reason: RefusalReason.NoActionPoints })
      expect(executed).toHaveLength(0)
    })

    it('should pause drain when a reaction window is open', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')

      // Action that opens a fake window as a side-effect
      const executed: string[] = []
      const windowAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          executed.push('window-action')
          const stub: IReactionWindow = { getId: () => 'w1', getType: () => ReactionWindowType.Modifier, getRespondentId: () => 'p1', isOptional: () => false, blocksActions: () => false, getOptions: () => [], isOpen: () => true, submitReaction: () => accepted(), resolve: () => {}, cancel: () => {}, capClock: () => {}, resultKey: () => NO_CONTEXT_RESULT, getDetail: () => ({}), getDeadline: () => 0 }
          g.addFrame('f1', g.clone(), [stub])
          return []
        },
      }
      const afterAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          executed.push('after-action')
          return []
        },
      }

      tm.enqueue(windowAction)
      tm.enqueue(afterAction)

      // window-action ran, afterAction was paused
      expect(executed).toEqual(['window-action'])
      expect(tm.getPhase()).toBe(TurnPhase.Action)
    })

    it('should resume drain after resumeDrain() is called', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')

      const executed: string[] = []

      const windowAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          const stub: IReactionWindow = { getId: () => 'w1', getType: () => ReactionWindowType.Modifier, getRespondentId: () => 'p1', isOptional: () => false, blocksActions: () => false, getOptions: () => [], isOpen: () => true, submitReaction: () => accepted(), resolve: () => {}, cancel: () => {}, capClock: () => {}, resultKey: () => NO_CONTEXT_RESULT, getDetail: () => ({}), getDeadline: () => 0 }
          g.addFrame('f1', g.clone(), [stub])
          executed.push('window-action')
          return []
        },
      }
      const afterAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          executed.push('after-action')
          return []
        },
      }

      tm.enqueue(windowAction)
      tm.enqueue(afterAction)
      expect(executed).toEqual(['window-action'])

      // Release the frame and resume
      gs.releaseFrame('f1')
      tm.resumeDrain()
      expect(executed).toEqual(['window-action', 'after-action'])
    })
  })

  // ---------------------------------------------------------------------------
  // The other pipeline. A turn is not over while an ability is still resolving,
  // and TurnManager reads that off GameState rather than holding a TaskManager.
  // ---------------------------------------------------------------------------

  describe('a running ability holds the turn open', () => {
    /** A pipeline parked on a frame, exactly as TaskManager.pauseOn leaves one. */
    const parkAbility = (gs: GameState) => {
      gs.pushPipeline({
        steps: [{ execute: () => {} }],
        ctx: new AbilityContext('src-card', 'p1'),
        pausedOn: 'f-ability',
      })
    }

    it('does not end the turn at 0 AP while a pipeline is still on the stack', () => {
      const gs = makeGs(1)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')

      // The action spends the last point and sets an ability going, the way a
      // played hero leads to a roll offer.
      tm.enqueue({
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          parkAbility(g)
        },
      })

      expect(gs.getActionPoints('p1')).toBe(0)
      expect(tm.getPhase()).toBe(TurnPhase.Action)
    })

    it('ends it on the next drain, once the ability has run itself out', () => {
      const gs = makeGs(1)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      tm.enqueue({
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          parkAbility(g)
        },
      })

      // What TaskManager leaves behind when the last pipeline is spent; the
      // FrameResolved that emptied it is the same one GameEngine resumes on.
      while (gs.popPipeline()) {}
      tm.resumeDrain()

      expect(tm.getPhase()).toBe(TurnPhase.End)
    })

    it('holds a queued action back until the ability is done', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')

      const executed: string[] = []
      const later: IAction = {
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          executed.push('later')
        },
      }

      tm.enqueue({
        ...makeAction(1),
        isReactable: () => false,
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          parkAbility(g)
        },
      })
      tm.enqueue({ ...later, isReactable: () => false })

      expect(executed).toEqual([])
      expect(tm.getQueuedActions().map((a) => a.execute)).toEqual([later.execute])

      while (gs.popPipeline()) {}
      tm.resumeDrain()
      expect(executed).toEqual(['later'])
    })

    it('refuses a reactable request while an ability is resolving', () => {
      const gs = makeGs(3)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      parkAbility(gs)

      const executed: string[] = []
      const result = tm.enqueue({
        ...makeAction(1),
        isReactable: () => true,
        execute: () => {
          executed.push('reactable')
        },
      })

      // Refused outright, not merely delayed: enqueue drops a reactable
      // request rather than queueing it behind the resolution.
      expect(result).toEqual({ accepted: false, reason: RefusalReason.Busy })
      expect(executed).toEqual([])
      expect(tm.getQueuedActions()).toHaveLength(0)
    })

    it('counts a pipeline parked between a released frame and its FrameResolved', () => {
      const gs = makeGs(1)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      gs.getPlayer('p1')!.decreaseActionPoints(1)

      // A window releases its frame BEFORE it announces the outcome, so for
      // that moment no frame is open and the pipeline has not woken yet.
      parkAbility(gs)
      expect(gs.hasOpenFrames()).toBe(false)

      tm.resumeDrain()

      expect(tm.getPhase()).toBe(TurnPhase.Action)
    })
  })

  describe('endTurn()', () => {
    it('should set phase to TurnEnd', () => {
      const gs = makeGs()
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')
      tm.endTurn()
      expect(tm.getPhase()).toBe(TurnPhase.End)
    })

    it('should emit TurnEnded event', () => {
      const gs = makeGs()
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')
      received.length = 0 // clear TurnStarted
      tm.endTurn()
      expect(
        received.some((e) => e.getType() === GameEventType.TurnEnded),
      ).toBe(true)
    })

    it('should auto-end turn when action points reach zero', () => {
      const gs = makeGs(1)
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')
      tm.enqueue(makeAction(1)) // costs last point → auto-endTurn
      expect(tm.getPhase()).toBe(TurnPhase.End)
      expect(
        received.some((e) => e.getType() === GameEventType.TurnEnded),
      ).toBe(true)
    })

    it('should NOT auto-end when AP=0 but a reaction window is still open', () => {
      const gs = makeGs(1)
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')

      const windowAction: IAction = {
        ...makeAction(1),
        execute: (g) => {
          g.getPlayer('p1')?.decreaseActionPoints(1)
          const stub: IReactionWindow = { getId: () => 'w1', getType: () => ReactionWindowType.Modifier, getRespondentId: () => 'p1', isOptional: () => false, blocksActions: () => false, getOptions: () => [], isOpen: () => true, submitReaction: () => accepted(), resolve: () => {}, cancel: () => {}, capClock: () => {}, resultKey: () => NO_CONTEXT_RESULT, getDetail: () => ({}), getDeadline: () => 0 }
          g.addFrame('f1', g.clone(), [stub])
          return []
        },
      }
      tm.enqueue(windowAction)
      // AP is 0 but window is open — turn should NOT have ended
      expect(tm.getPhase()).toBe(TurnPhase.Action)
    })
  })
})

describe('the turn clock', () => {
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

  it('runs only when a turn time is configured', async () => {
    const gs = makeGs()
    const tm = new TurnManager(gs, new GameEventEmitter())
    tm.startTurn('p1')
    await sleep(30)
    expect(tm.getPhase()).toBe(TurnPhase.Action)
    expect(gs.getActionPoints('p1')).toBe(3)
  })

  it('ends an idle turn when it lapses: the budget is forfeited, TurnEnded goes out', async () => {
    const gs = makeGs()
    const emitter = new GameEventEmitter()
    const received: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => received.push(e) })
    const tm = new TurnManager(gs, emitter, 20)

    tm.startTurn('p1')
    expect(tm.getPhase()).toBe(TurnPhase.Action)
    await sleep(60)

    expect(tm.getPhase()).toBe(TurnPhase.End)
    expect(gs.getActionPoints('p1')).toBe(0)
    expect(received.filter((e) => e.getType() === GameEventType.TurnEnded)).toHaveLength(1)
  })

  it('pauses while a window is open — anyone’s — and runs again once the last one closes', async () => {
    const gs = makeGs()
    const emitter = new GameEventEmitter()
    const received: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => received.push(e) })
    const tm = new TurnManager(gs, emitter, 40)
    tm.startTurn('p1')

    // Another seat's window: it is on the board, and announced the way a
    // real one is (opened before it is filed, closed before it announces).
    let open = true
    const stub = {
      isOpen: () => open,
    } as IReactionWindow
    gs.addFrame('f1', gs.clone(), [stub])
    emitter.emit(GameEventFactory.reactionWindowOpened(ReactionWindowType.Challenge, 'p2', 'f1'))
    await sleep(100)
    expect(tm.getPhase()).toBe(TurnPhase.Action)
    expect(gs.getActionPoints('p1')).toBe(3)

    open = false
    gs.releaseFrame('f1')
    emitter.emit(GameEventFactory.frameResolved('f1', []))
    await sleep(80)

    expect(tm.getPhase()).toBe(TurnPhase.End)
    expect(received.filter((e) => e.getType() === GameEventType.TurnEnded)).toHaveLength(1)
  })

  it('runs again on the frame settling, not on the close a roll announces before it', async () => {
    const gs = makeGs()
    const emitter = new GameEventEmitter()
    const tm = new TurnManager(gs, emitter, 200)
    tm.startTurn('p1')

    emitter.emit(GameEventFactory.reactionWindowOpened(ReactionWindowType.Attack, 'p1', 'f1'))
    expect(tm.getTurnDeadline()).toBeUndefined()

    emitter.emit(GameEventFactory.reactionWindowClosed(ReactionWindowType.Attack, 'p1', 'f1'))
    expect(tm.getTurnDeadline()).toBeUndefined()

    emitter.emit(GameEventFactory.frameResolved('f1', [8]))
    expect(tm.getTurnDeadline()).toBeDefined()
    tm.stopClock()
  })

  it('takes the time already spent off what is left when it pauses', async () => {
    const gs = makeGs()
    const emitter = new GameEventEmitter()
    const tm = new TurnManager(gs, emitter, 100)
    tm.startTurn('p1')
    await sleep(70)

    emitter.emit(GameEventFactory.reactionWindowOpened(ReactionWindowType.Challenge, 'p2', 'f1'))
    await sleep(100)
    emitter.emit(GameEventFactory.frameResolved('f1', []))
    // ~30 ms were left, not another 100.
    await sleep(60)

    expect(tm.getPhase()).toBe(TurnPhase.End)
  })

  it('reports what is left, counting the running part off as it goes', async () => {
    const gs = makeGs()
    const emitter = new GameEventEmitter()
    const tm = new TurnManager(gs, emitter, 200)
    expect(tm.getRemainingMs()).toBeUndefined()
    expect(tm.getTurnDeadline()).toBeUndefined()
    expect(tm.getTurnTimeMs()).toBe(200)

    tm.startTurn('p1')
    const deadline = tm.getTurnDeadline()!
    const atStart = tm.getRemainingMs()!
    expect(atStart).toBeLessThanOrEqual(200)
    await sleep(40)
    // The deadline is an instant and does not move; what is LEFT does.
    expect(tm.getTurnDeadline()).toBe(deadline)
    expect(tm.getRemainingMs()!).toBeLessThan(atStart)

    emitter.emit(GameEventFactory.reactionWindowOpened(ReactionWindowType.Challenge, 'p2', 'f1'))
    const held = tm.getRemainingMs()!
    expect(tm.getTurnDeadline()).toBeUndefined()
    await sleep(40)
    // Frozen: a held clock reads the same number however long the window stands.
    expect(tm.getRemainingMs()).toBe(held)

    emitter.emit(GameEventFactory.frameResolved('f1', []))
    // A new deadline, further out by however long the window stood.
    expect(tm.getTurnDeadline()!).toBeGreaterThan(deadline)

    tm.stopClock()
    expect(tm.getRemainingMs()).toBeUndefined()
    expect(tm.getTurnDeadline()).toBeUndefined()
  })

  it('has no clock to report on a table with no turn time', () => {
    const gs = makeGs()
    const tm = new TurnManager(gs, new GameEventEmitter())
    tm.startTurn('p1')

    expect(tm.getTurnTimeMs()).toBeUndefined()
    expect(tm.getRemainingMs()).toBeUndefined()
    expect(tm.getTurnDeadline()).toBeUndefined()
  })

  it('is stopped by the end of the turn, so a finished turn never lapses', async () => {
    const gs = makeGs()
    const emitter = new GameEventEmitter()
    const received: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => received.push(e) })
    const tm = new TurnManager(gs, emitter, 20)

    tm.startTurn('p1')
    tm.endTurn()
    await sleep(60)

    expect(received.filter((e) => e.getType() === GameEventType.TurnEnded)).toHaveLength(1)
  })

  it('is stopped by stopClock, which a concluded game calls', async () => {
    const gs = makeGs()
    const emitter = new GameEventEmitter()
    const received: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => received.push(e) })
    const tm = new TurnManager(gs, emitter, 20)

    tm.startTurn('p1')
    tm.stopClock()
    await sleep(60)

    expect(tm.getPhase()).toBe(TurnPhase.Action)
    expect(received.filter((e) => e.getType() === GameEventType.TurnEnded)).toHaveLength(0)
  })
})

describe('seamless reactions', () => {
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

  /** A table window on the board, as a stub: open until told otherwise. */
  const tableWindow = (
    type: ReactionWindowType,
    detail: Record<string, unknown> = {},
  ) => {
    const stub: { open: boolean; capped: number[]; window: IReactionWindow } = {
      open: true,
      capped: [],
      window: {
        getId: () => 'w1',
        getType: () => type,
        getRespondentId: () => 'p1',
        isOptional: () => false,
        blocksActions: () => false,
        getOptions: () => [],
        isOpen: () => stub.open,
        submitReaction: () => accepted(),
        resolve: () => {
          stub.open = false
        },
        cancel: () => {},
        capClock: (ms: number) => {
          stub.capped.push(ms)
        },
        resultKey: () => NO_CONTEXT_RESULT,
        getDetail: () => detail,
        getDeadline: () => 0,
      } as IReactionWindow,
    }
    return stub
  }

  it('runs the clock under an open table window, holds it while a contest runs', async () => {
    const gs = makeGs(3, true)
    const emitter = new GameEventEmitter()
    const tm = new TurnManager(gs, emitter, 500)
    tm.startTurn('p1')

    const detail: Record<string, unknown> = { challenged: false }
    const contest = tableWindow(ReactionWindowType.Challenge, detail)
    contest.window.blocksActions = () => detail['challenged'] === true
    gs.addFrame('f1', gs.clone(), [contest.window])
    emitter.emit(GameEventFactory.reactionWindowOpened(ReactionWindowType.Challenge, 'p1', 'f1'))
    await sleep(5)
    expect(tm.getTurnDeadline()).toBeDefined()

    detail['challenged'] = true
    emitter.emit(GameEventFactory.challengeStarted('p2', 'p1', 'card', 5, 5, [], []))
    expect(tm.getTurnDeadline()).toBeUndefined()

    contest.open = false
    gs.releaseFrame('f1')
    emitter.emit(GameEventFactory.reactionWindowClosed(ReactionWindowType.Challenge, 'p1', 'f1'))
    expect(tm.getTurnDeadline()).toBeDefined()
    tm.stopClock()
  })

  it('a spent turn caps every open window and ends once they have settled', () => {
    const gs = makeGs(1, true)
    const emitter = new GameEventEmitter()
    const tm = new TurnManager(gs, emitter)
    tm.startTurn('p1')
    const roll = tableWindow(ReactionWindowType.Modifier)
    gs.addFrame('f1', gs.clone(), [roll.window])

    // Taken under the open window, and it spends the last point.
    expect(tm.enqueue(makeAction(1))).toEqual(accepted())
    expect(tm.getPhase()).toBe(TurnPhase.Action)
    expect(roll.capped).toEqual([10_000])

    roll.open = false
    gs.releaseFrame('f1')
    tm.resumeDrain()
    expect(tm.getPhase()).toBe(TurnPhase.End)
  })

  it('caps once per turn: a window given its full wait back by a reaction is not capped again', () => {
    const gs = makeGs(1, true)
    const tm = new TurnManager(gs, new GameEventEmitter())
    tm.startTurn('p1')
    const roll = tableWindow(ReactionWindowType.Modifier)
    gs.addFrame('f1', gs.clone(), [roll.window])

    tm.enqueue(makeAction(1))
    expect(roll.capped).toEqual([10_000])
    // Every later drain of the spent turn — a reaction's continuation, a
    // close — leaves the window's clock alone.
    tm.resumeDrain()
    tm.resumeDrain()
    expect(roll.capped).toEqual([10_000])
  })

  it('a spent turn under a question caps nothing; the cap lands when the last question settles', () => {
    const gs = makeGs(1, true)
    const tm = new TurnManager(gs, new GameEventEmitter())
    tm.startTurn('p1')
    const roll = tableWindow(ReactionWindowType.Challenge)
    const question = tableWindow(ReactionWindowType.CardChoice)
    gs.addFrame('f1', gs.clone(), [roll.window])
    gs.addFrame('f2', gs.clone(), [question.window])

    // The last point spent while the play's question is still being answered.
    expect(tm.enqueue(makeAction(1))).toEqual(accepted())
    expect(roll.capped).toEqual([])
    expect(question.capped).toEqual([])
    tm.resumeDrain()
    expect(roll.capped).toEqual([])

    question.open = false
    gs.releaseFrame('f2')
    tm.resumeDrain()
    expect(roll.capped).toEqual([10_000])
    expect(question.capped).toEqual([])
    expect(tm.getPhase()).toBe(TurnPhase.Action)

    roll.open = false
    gs.releaseFrame('f1')
    tm.resumeDrain()
    expect(tm.getPhase()).toBe(TurnPhase.End)
  })

  it('a question opened after the cap holds the end again: the table windows are capped once more when it settles', () => {
    const gs = makeGs(1, true)
    const tm = new TurnManager(gs, new GameEventEmitter())
    tm.startTurn('p1')
    const roll = tableWindow(ReactionWindowType.Modifier)
    gs.addFrame('f1', gs.clone(), [roll.window])
    tm.enqueue(makeAction(1))
    expect(roll.capped).toEqual([10_000])

    // A fight-back's question, asked of somebody after the roll settled its outcome.
    const question = tableWindow(ReactionWindowType.PlayerChoice)
    gs.addFrame('f2', gs.clone(), [question.window])
    tm.resumeDrain()
    expect(roll.capped).toEqual([10_000])

    question.open = false
    gs.releaseFrame('f2')
    tm.resumeDrain()
    expect(roll.capped).toEqual([10_000, 10_000])
  })

  it('sizes a new window by the turn: capped on a spent turn, full while a question stands or points remain', () => {
    // A window sizes itself by the ACTIVE player's budget: the seat the turn names.
    const spent = makeGs(0, true)
    spent.setCurrentPlayerId('p1')
    expect(spent.cappedClock(30_000)).toBe(10_000)
    expect(spent.cappedClock(5_000)).toBe(5_000)

    const question = tableWindow(ReactionWindowType.CardChoice)
    spent.addFrame('f1', spent.clone(), [question.window])
    expect(spent.hasOpenQuestions()).toBe(true)
    expect(spent.cappedClock(30_000)).toBe(30_000)

    const roll = tableWindow(ReactionWindowType.Attack)
    const live = makeGs(1, true)
    live.setCurrentPlayerId('p1')
    live.addFrame('f1', live.clone(), [roll.window])
    expect(live.hasOpenQuestions()).toBe(false)
    expect(live.cappedClock(30_000)).toBe(30_000)
  })

  it('refuses an action while a question of the player stands, and forfeits an optional one', () => {
    const gs = makeGs(3, true)
    const tm = new TurnManager(gs, new GameEventEmitter())
    tm.startTurn('p1')

    const question = tableWindow(ReactionWindowType.CardChoice)
    question.window.blocksActions = () => true
    gs.addFrame('f1', gs.clone(), [question.window])
    expect(tm.enqueue(makeAction(1))).toEqual(refused(RefusalReason.Busy))
    question.open = false
    gs.releaseFrame('f1')

    const offer = tableWindow(ReactionWindowType.TaskChoice)
    ;(offer.window as { isOptional?: () => boolean }).isOptional = () => true
    gs.addFrame('f2', gs.clone(), [offer.window])
    expect(tm.enqueue(makeAction(1))).toEqual(accepted())
    expect(offer.open).toBe(false)
    expect(gs.getActionPoints('p1')).toBe(2)
  })
})
