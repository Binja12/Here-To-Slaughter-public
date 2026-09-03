import { Logger } from '@nestjs/common'
import { GAME_SNAPSHOT, RefusalReason } from 'shared'
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
import type { RunningGame } from './game-registry.service'
import { SnapshotPublisherService } from './snapshot-publisher.service'

// ---------------------------------------------------------------------------
// The observer, on a real dealt table driven through the real dispatcher,
// with the Socket.IO server stood in for by a recorder: what was pushed, to
// which room, is the whole question. Real windows on the harness's short
// clock, so a window lapsing on its own is a real timer firing.
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

  beforeAll(() => {
    Logger.overrideLogger(false)
  })

  beforeEach(() => {
    // Alice holds hero-001 and modifier-080; Bob holds hero-002 and modifier-081.
    t = stacked({
      seats: [ALICE, BOB],
      handSize: 2,
      deck: ['hero-001', 'modifier-080', 'hero-002', 'modifier-081'],
    })
    expect(active(t)).toBe(ALICE)
    running = { game: t.game, arrived: new Set(), version: 0 }
    dispatcher = new CommandDispatcherService()
    sent = []

    const publisher = new SnapshotPublisherService()
    publisher.bind(recorder(sent))
    publisher.watch(running)
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
