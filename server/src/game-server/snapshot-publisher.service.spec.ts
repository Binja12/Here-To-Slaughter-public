import { Logger } from '@nestjs/common'
import type { ClientProxy } from '@nestjs/microservices'
import { of } from 'rxjs'
import {
  DEFAULT_GAME_SETTINGS,
  GAME_COMPLETED,
  GAME_COMPLETED_PATTERN,
  GAME_SNAPSHOT,
  GameEventType,
  GamePhase,
  RefusalReason,
} from 'shared'
import type { GameSnapshot } from 'shared'
import type { Server } from 'socket.io'
import {
  Table,
  active,
  settle,
  stacked,
} from '../game/setup/play-through-helpers'
import { playerView } from '../game/views/player-view'
import { CommandDispatcherService } from './command-dispatcher.service'
import { GameRegistryService } from './game-registry.service'
import type { RunningGame } from './game-registry.service'
import { SnapshotPublisherService } from './snapshot-publisher.service'
import { dealQuickWin, winFirstTurn } from './spec-helpers'
import { GameLog } from '../game/views/game-log'
import { InMemoryGameStore } from './stores/in-memory-game.store'

// ---------------------------------------------------------------------------
// The observer, on a real dealt table driven through the real dispatcher,
// with the Socket.IO server stood in for by a recorder and the lobby by a
// spy: what was pushed, to which room, and what the lobby was told, is the
// whole question. Real windows on the harness's short clock, so a window
// lapsing on its own is a real timer firing.
// ---------------------------------------------------------------------------

const ALICE = 'alice'
const BOB = 'bob'
const UUID = '11111111-1111-4111-8111-111111111111'

type Sent = { room: string; event: string; snapshot: GameSnapshot }

describe('SnapshotPublisherService', () => {
  let t: Table
  let running: RunningGame
  let dispatcher: CommandDispatcherService
  let sent: Sent[]
  let lobby: { emit: jest.Mock }
  let publisher: SnapshotPublisherService
  let store: InMemoryGameStore

  beforeAll(() => {
    Logger.overrideLogger(false)
  })

  beforeEach(async () => {
    // Alice holds hero-001 and modifier-080; Bob holds hero-002 and modifier-081.
    t = stacked({
      seats: [ALICE, BOB],
      handSize: 2,
      deck: ['hero-001', 'modifier-080', 'hero-002', 'modifier-081'],
    })
    expect(active(t)).toBe(ALICE)
    const log = new GameLog(t.game.gameState)
    t.game.emitter.addListener(log)
    running = { game: t.game, arrived: new Set(), left: new Set(), version: 0, log }
    dispatcher = new CommandDispatcherService()
    sent = []
    lobby = { emit: jest.fn(() => of(undefined)) }

    store = new InMemoryGameStore()
    publisher = new SnapshotPublisherService(lobby as unknown as ClientProxy, store)
    publisher.bind(recorder(sent))
    publisher.watch(running)
    // The registry stores a table at its birth; this table has no registry.
    await store.create({
      gameId: t.game.gameId,
      createdAt: new Date(),
      seats: t.game.playerOrder.map((accountId, seat) => ({ accountId, username: accountId, seat })),
      settings: DEFAULT_GAME_SETTINGS,
      config: t.game.config,
    })
  })

  afterEach(async () => {
    await settle(t)
  })

  const command = (type: string, payload: unknown = {}) => ({
    commandId: UUID,
    type,
    payload,
  })

  /** Lets the scheduled flush run: one turn of the event loop. */
  const nextTurn = () => new Promise<void>((done) => setImmediate(done))

  const room = (accountId: string) => `${t.game.gameId}:${accountId}`

  it('pushes one snapshot per seat for a command that emits many events', async () => {
    const result = dispatcher.dispatch(
      t.game,
      ALICE,
      command('PlayHero', { cardId: 'hero-001' }),
    )
    expect(result).toEqual({ commandId: UUID, accepted: true })
    expect(sent).toHaveLength(0)

    await nextTurn()

    expect(sent.map((s) => s.room).sort()).toEqual([room(ALICE), room(BOB)])
    expect(sent.every((s) => s.event === GAME_SNAPSHOT)).toBe(true)
    expect(sent.every((s) => s.snapshot.version === 1)).toBe(true)
    expect(running.version).toBe(1)
  })

  it('builds each seat its own view, taken after the burst', async () => {
    dispatcher.dispatch(t.game, ALICE, command('PlayHero', { cardId: 'hero-001' }))
    await nextTurn()

    const alice = sent.find((s) => s.room === room(ALICE))!.snapshot
    const bob = sent.find((s) => s.room === room(BOB))!.snapshot
    expect(alice.state).toEqual(playerView(t.game, ALICE))
    expect(bob.state).toEqual(playerView(t.game, BOB))
    // The resting point: the hero is in the party and its challenge window
    // is open for everyone to see — not the transient board mid-play.
    expect(alice.state.parties.find((p) => p.playerId === ALICE)!.heroes).toHaveLength(1)
    expect(alice.state.busy).toBe(true)
    expect(alice.state.pendingWindows).toHaveLength(1)
    // A hand is named to its owner and counted to everybody else.
    expect(alice.state.hand.map((c) => c.id)).toEqual(['modifier-080'])
    expect(bob.state.hand.map((c) => c.id)).toEqual(['hero-002', 'modifier-081'])
    expect(bob.state.seats.find((s) => s.playerId === ALICE)!.handCount).toBe(1)
  })

  it('ships each seat the story in its own words, with the view', async () => {
    dispatcher.dispatch(t.game, ALICE, command('DrawCard'))
    await nextTurn()

    const alice = sent.find((s) => s.room === room(ALICE))!.snapshot
    const bob = sent.find((s) => s.room === room(BOB))!.snapshot
    expect(alice.log).toEqual(running.log.entriesFor(ALICE))
    expect(bob.log).toEqual(running.log.entriesFor(BOB))
    expect(alice.log.at(-1)!.text).toMatch(/^alice drew (?!a card$)/)
    expect(bob.log.at(-1)!.text).toBe('alice drew a card')
  })

  it('hands every flush to the store: the burst, the lines, the board per seat', async () => {
    dispatcher.dispatch(t.game, ALICE, command('PlayHero', { cardId: 'hero-001' }))
    await nextTurn()

    const stored = store.get(t.game.gameId)!
    expect(stored.version).toBe(1)
    expect(stored.views[ALICE]).toEqual(sent.find((s) => s.room === room(ALICE))!.snapshot.state)
    expect(stored.views[BOB]).toEqual(sent.find((s) => s.room === room(BOB))!.snapshot.state)
    expect(stored.events.map((e) => e.type)).toEqual(
      expect.arrayContaining([GameEventType.CardRemovedFromHand, GameEventType.HeroAddedToParty]),
    )
    expect(stored.lines.map((l) => l.line.text)).toContain('alice played Bad Axe')
    expect(stored.winnerId).toBeUndefined()

    // The next flush brings only what came since.
    const before = stored.events.length
    dispatcher.dispatch(t.game, BOB, command('PassWindow', {
      windowId: playerView(t.game, BOB).pendingWindows[0].windowId,
    }))
    await nextTurn()
    const again = store.get(t.game.gameId)!
    expect(again.version).toBe(2)
    expect(again.events.length).toBeGreaterThan(before)
    expect(again.events.map((e) => e.seq)).toEqual(again.events.map((_, i) => i + 1))
  })

  it('pushes nothing for a refused command: nothing happened', async () => {
    const result = dispatcher.dispatch(t.game, BOB, command('DrawCard'))
    expect(result).toEqual({
      commandId: UUID,
      accepted: false,
      reason: RefusalReason.NotYourTurn,
    })

    await nextTurn()

    expect(sent).toHaveLength(0)
    expect(running.version).toBe(0)
  })

  it('pushes on its own when a window lapses on its timer, with no command behind it', async () => {
    dispatcher.dispatch(t.game, ALICE, command('PlayHero', { cardId: 'hero-001' }))
    await nextTurn()
    const afterPlay = sent.length
    expect(afterPlay).toBe(2)

    // Nobody challenges, nobody answers the roll offer: the clock does it.
    await settle(t)

    expect(sent.length).toBeGreaterThan(afterPlay)
    const last = sent[sent.length - 1].snapshot
    expect(last.state.busy).toBe(false)
    expect(last.version).toBe(running.version)
    // Every flush pushed exactly one snapshot per seat, versions climbing.
    const versions = sent.map((s) => s.snapshot.version)
    for (let v = 1; v <= running.version; v++) {
      expect(versions.filter((x) => x === v)).toHaveLength(2)
    }
  })

  describe('the end', () => {
    it('pushes the final board as game-completed to every seat, and tells the lobby once', async () => {
      // A table this publisher watches from birth, won in one turn.
      const registry = new GameRegistryService(publisher, store)
      const won = dealQuickWin(registry, [ALICE, BOB])
      for (const id of [ALICE, BOB]) registry.arrive(won, id)
      const before = sent.length
      const wonRoom = (id: string) => `${won.game.gameId}:${id}`

      await winFirstTurn(won.game)
      await nextTurn()

      const ending = sent.slice(before).filter((s) => s.event === GAME_COMPLETED)
      expect(ending.map((s) => s.room).sort()).toEqual([wonRoom(ALICE), wonRoom(BOB)])
      expect(ending.every((s) => s.snapshot.version === won.version)).toBe(true)
      expect(ending.every((s) => s.snapshot.state.phase === GamePhase.Concluded)).toBe(true)
      expect(store.get(won.game.gameId)!.winnerId).toBe(won.game.gameState.getWinnerId())
      expect(store.get(won.game.gameId)!.events.map((e) => e.type)).toContain(GameEventType.GameEnded)
      expect(ending.find((s) => s.room === wonRoom(BOB))!.snapshot.state).toEqual(
        playerView(won.game, BOB),
      )
      // The ending flush is game-completed INSTEAD of game:snapshot.
      expect(
        sent.slice(before).filter((s) => s.snapshot.version === won.version),
      ).toHaveLength(2)
      expect(lobby.emit).toHaveBeenCalledTimes(1)
      expect(lobby.emit).toHaveBeenCalledWith(GAME_COMPLETED_PATTERN, {
        gameId: won.game.gameId,
      })
    })

    it('tells the lobby about no table that is still live', async () => {
      dispatcher.dispatch(t.game, ALICE, command('PlayHero', { cardId: 'hero-001' }))
      await settle(t)

      expect(sent.some((s) => s.event === GAME_COMPLETED)).toBe(false)
      expect(lobby.emit).not.toHaveBeenCalled()
    })
  })
})

/** A Socket.IO server that only remembers what it was told to emit, and where. */
function recorder(sent: Sent[]): Server {
  return {
    to: (room: string) => ({
      emit: (event: string, snapshot: GameSnapshot) => {
        sent.push({ room, event, snapshot })
        return true
      },
    }),
  } as unknown as Server
}
