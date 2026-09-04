import { GameEventType, IGameEvent, ReactionWindowType } from 'shared'
import { GameEngine } from './game-engine'
import { GameState } from './pipelines/game-state'
import { TurnManager } from './pipelines/turn-manager'
import { GameEventEmitter } from './events/game-event-emitter'
import { Player } from './state-structures/player'
import { Party } from './state-structures/party'
import { CardStack } from './state-structures/card-stack'
import { CardPile } from './state-structures/card-pile'
import { IWinCondition } from './interfaces'
import { GameEventFactory } from './events/game-event-factory'

const makePlayer = (id: string, points = 3) =>
  new Player({
    id,
    name: id,
    hand: [],
    partyId: `party-${id}`,
    actionPoints: points,
  })

const makeParty = (playerId: string) =>
  new Party({
    playerId,
    leaderId: `leader-${playerId}`,
    heroIds: [],
    monsterIds: [],
  })

const makeGs = (...playerIds: string[]) => {
  const deck = new CardStack('deck', 'main')
  const gs = new GameState(
    deck,
    new CardPile('discard', 'discard-pile'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  for (const id of playerIds) {
    gs.registerPlayer(makePlayer(id))
    gs.registerParty(makeParty(id))
  }
  return gs
}

describe('GameEngine', () => {
  describe('start()', () => {
    it('should start the first player turn', () => {
      const gs = makeGs('p1', 'p2')
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const engine = new GameEngine(gs, tm, emitter)

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      engine.start(['p1', 'p2'])

      expect(
        received.some(
          (e) =>
            e.getType() === GameEventType.TurnStarted &&
            e.getPlayerId() === 'p1',
        ),
      ).toBe(true)
    })

    it('should do nothing for empty player order', () => {
      const gs = makeGs()
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const engine = new GameEngine(gs, tm, emitter)
      expect(() => engine.start([])).not.toThrow()
    })
  })

  describe('turn rotation', () => {
    it('should start next player turn after TurnEnded', () => {
      const gs = makeGs('p1', 'p2')
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const engine = new GameEngine(gs, tm, emitter)

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      engine.start(['p1', 'p2'])
      // p1 has 3 action points; endTurn() is called manually to simulate end
      tm.endTurn()

      const turnStarts = received.filter(
        (e) => e.getType() === GameEventType.TurnStarted,
      )
      expect(turnStarts.some((e) => e.getPlayerId() === 'p2')).toBe(true)
    })

    it('should wrap around to the first player after the last', () => {
      const gs = makeGs('p1', 'p2')
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const engine = new GameEngine(gs, tm, emitter)
      engine.start(['p1', 'p2'])
      tm.endTurn() // p1 ends → p2 starts
      tm.endTurn() // p2 ends → p1 starts again

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      // Current player should be p1 again
      expect(gs.getCurrentPlayerId()).toBe('p1')
    })
  })

  describe('win conditions', () => {
    it('should emit GameEnded when a win condition is met', () => {
      const gs = makeGs('p1')
      const player = gs.getPlayer('p1')!
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)

      const winCondition: IWinCondition = { isMetBy: (_, who) => who === player }
      const engine = new GameEngine(gs, tm, emitter, [winCondition])

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      engine.start(['p1'])
      tm.endTurn()

      expect(
        received.some((e) => e.getType() === GameEventType.GameEnded),
      ).toBe(true)
    })

    it('ends the game the moment a settled frame qualifies, not at the end of the turn', () => {
      const gs = makeGs('p1', 'p2')
      const player = gs.getPlayer('p1')!
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      let qualifies = false
      const winCondition: IWinCondition = {
        isMetBy: (_, who) => qualifies && who === player,
      }
      const engine = new GameEngine(gs, tm, emitter, [winCondition])

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      engine.start(['p1', 'p2'])

      // the sixth class lands inside a frame; the frame settles, the board is idle
      qualifies = true
      emitter.emit(GameEventFactory.frameResolved('frame-1', []))

      expect(received.some((e) => e.getType() === GameEventType.GameEnded)).toBe(true)
      expect(received.some((e) => e.getType() === GameEventType.TurnEnded)).toBe(false)
      expect(gs.getWinnerId()).toBe('p1')
    })

    /**
     * Asked after TaskManager has continued the pipeline the frame held, so
     * what stands open now is either a frame BENEATH it (an outcome still
     * pending: the board is not settled) or a frame the continuation just
     * OPENED (a question: it is). Only the first holds the win back.
     */
    const stubWindow = (type: ReactionWindowType) =>
      ({ isOpen: () => true, getType: () => type, cancel: () => {} }) as never

    const qualified = () => {
      const gs = makeGs('p1', 'p2')
      const player = gs.getPlayer('p1')!
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const winCondition: IWinCondition = { isMetBy: (_, who) => who === player }
      const engine = new GameEngine(gs, tm, emitter, [winCondition])
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })
      engine.start(['p1', 'p2'])
      return { gs, emitter, ended: () => received.some((e) => e.getType() === GameEventType.GameEnded) }
    }

    it('waits for an outcome still pending — a frame settling under an open challenge ends nothing', () => {
      const { gs, emitter, ended } = qualified()
      gs.addFrame('outer', {
        snapshot: gs.clone(),
        windows: [stubWindow(ReactionWindowType.Challenge)],
      })

      emitter.emit(GameEventFactory.frameResolved('inner', []))

      expect(ended()).toBe(false)
    })

    it('ends under an open QUESTION — the roll offered to the hero that landed the sixth class does not hold the win back', () => {
      const { gs, emitter, ended } = qualified()
      // What TaskManager opens on the settled challenge, before the engine hears it.
      gs.addFrame('offer', {
        snapshot: gs.clone(),
        windows: [stubWindow(ReactionWindowType.TaskChoice)],
      })

      emitter.emit(GameEventFactory.frameResolved('challenge', [true], undefined, 'hero-1'))

      expect(ended()).toBe(true)
      // Concluding put the question down with the board.
      expect(gs.isBusy()).toBe(false)
    })

    /**
     * `requireAllWinConditions` — the lobby's "Monsters AND classes" table.
     * The point of asking per player: two parties each holding half is
     * nobody's win.
     */
    describe('every condition at once', () => {
      const metBy = (...ids: string[]): IWinCondition => ({
        isMetBy: (_, who) => ids.includes(who.getId()),
      })

      const ended = (conditions: IWinCondition[], requireAll: boolean) => {
        const gs = makeGs('p1', 'p2')
        const emitter = new GameEventEmitter()
        const tm = new TurnManager(gs, emitter)
        const engine = new GameEngine(gs, tm, emitter, conditions, requireAll)
        const received: IGameEvent[] = []
        emitter.addListener({ onEvent: (e) => received.push(e) })
        engine.start(['p1', 'p2'])
        tm.endTurn()
        return received.find((e) => e.getType() === GameEventType.GameEnded)
      }

      it('ends for the party that meets them all', () => {
        expect(ended([metBy('p1'), metBy('p1')], true)?.getPlayerId()).toBe('p1')
      })

      it('ends for nobody while the two halves sit in different parties', () => {
        expect(ended([metBy('p1'), metBy('p2')], true)).toBeUndefined()
      })

      it('ends for nobody on one condition alone', () => {
        expect(ended([metBy('p1'), metBy()], true)).toBeUndefined()
      })

      it('ends on either one when the table does not require all', () => {
        expect(ended([metBy('p1'), metBy()], false)?.getPlayerId()).toBe('p1')
        expect(ended([metBy(), metBy('p2')], false)?.getPlayerId()).toBe('p2')
      })

      it('ends for nobody at an empty condition list, either way', () => {
        expect(ended([], true)).toBeUndefined()
        expect(ended([], false)).toBeUndefined()
      })
    })

    it('should not start next turn after game ends', () => {
      const gs = makeGs('p1', 'p2')
      const player = gs.getPlayer('p1')!
      const emitter = new GameEventEmitter()
      const tm = new TurnManager(gs, emitter)
      const winCondition: IWinCondition = { isMetBy: (_, who) => who === player }
      const engine = new GameEngine(gs, tm, emitter, [winCondition])

      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      engine.start(['p1', 'p2'])
      tm.endTurn()

      const turnStarts = received.filter(
        (e) => e.getType() === GameEventType.TurnStarted,
      )
      // Only p1's initial turn start, no p2 start
      expect(turnStarts.every((e) => e.getPlayerId() === 'p1')).toBe(true)
    })
  })
})

describe('the turn clock across turns', () => {
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

  it('passes from seat to seat: every turn runs on its own clock', async () => {
    const gs = makeGs('p1', 'p2')
    const emitter = new GameEventEmitter()
    const tm = new TurnManager(gs, emitter, 20)
    const engine = new GameEngine(gs, tm, emitter)
    const received: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => received.push(e) })

    engine.start(['p1', 'p2'])
    await sleep(70)

    const starts = received
      .filter((e) => e.getType() === GameEventType.TurnStarted)
      .map((e) => e.getPlayerId())
    expect(starts.slice(0, 3)).toEqual(['p1', 'p2', 'p1'])
    tm.stopClock()
  })

  it('stops with the game: a concluded table never lapses a turn', async () => {
    const gs = makeGs('p1', 'p2')
    const player = gs.getPlayer('p1')!
    const emitter = new GameEventEmitter()
    const tm = new TurnManager(gs, emitter, 20)
    let qualifies = false
    const winCondition: IWinCondition = {
      isMetBy: (_, who) => qualifies && who === player,
    }
    const engine = new GameEngine(gs, tm, emitter, [winCondition])
    const received: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => received.push(e) })

    engine.start(['p1', 'p2'])
    qualifies = true
    emitter.emit(GameEventFactory.frameResolved('frame-1', []))
    expect(received.some((e) => e.getType() === GameEventType.GameEnded)).toBe(true)
    await sleep(60)

    expect(received.some((e) => e.getType() === GameEventType.TurnEnded)).toBe(false)
    expect(received.filter((e) => e.getType() === GameEventType.TurnStarted)).toHaveLength(1)
  })
})
