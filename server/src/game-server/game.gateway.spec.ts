import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'node:net'
import {
  GAME_COMMAND,
  GAME_COMPLETED,
  GAME_SNAPSHOT,
  GAME_STARTED,
  GamePhase,
  INTERNAL_ERROR,
  RefusalReason,
} from 'shared'
import type { CommandResult, GameSnapshot } from 'shared'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { playerView } from '../game/views/player-view'
import { GameRegistryService } from './game-registry.service'
import type { RunningGame } from './game-registry.service'
import { GameServerModule } from './game-server.module'
import { GAME_SESSION_RESOLVER } from './session/game-session.resolver'
import {
  InMemorySessionResolver,
  dealQuickWin,
  heroInHand,
  seated,
  tokenOf,
  untilIdle,
} from './spec-helpers'

// ---------------------------------------------------------------------------
// The browser's door, driven by real socket.io clients against the real
// gateway listening on a real port. Only the lobby is stood in for: an
// in-memory resolver where the token `<account>-token` belongs to
// `<account>`, which is the seam `IGameSessionResolver` exists for. The
// board is read through `playerView`.
//
// Tables are dealt by the registry, and the cases about commands start them
// through the registry's own door (`arrive`) rather than over sockets, so a
// command case is about the command. One process hosts every table these
// cases deal, as it will in service, so each case seats accounts of its own:
// an account sits at one table only, and the registry finds THAT one.
// ---------------------------------------------------------------------------

const UUID = '11111111-1111-4111-8111-111111111111'
const UUID_2 = '22222222-2222-4222-8222-222222222222'

describe('GameGateway', () => {
  let app: INestApplication
  let url: string
  let registry: GameRegistryService
  const sockets: Socket[] = []
  let tables = 0

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [GameServerModule],
    })
      .overrideProvider(GAME_SESSION_RESOLVER)
      .useValue(new InMemorySessionResolver())
      .compile()

    app = module.createNestApplication({ logger: false })
    await app.listen(0)
    const { port } = app.getHttpServer().address() as AddressInfo
    url = `http://127.0.0.1:${port}`
    registry = app.get(GameRegistryService)
  })

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect()
  })

  afterAll(async () => {
    await app.close()
  })

  /**
   * Opens a socket the way a browser does: the cookie rides the handshake.
   * `listen` runs before the connection is attempted, for events the server
   * sends on arrival.
   */
  function connect(
    token?: string,
    listen?: (socket: Socket) => void,
  ): Promise<Socket> {
    const socket = io(url, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      extraHeaders: token ? { cookie: `htsr_session=${token}` } : {},
    })
    sockets.push(socket)
    listen?.(socket)
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket))
      socket.once('connect_error', (error: Error) => reject(error))
    })
  }

  function send(
    socket: Socket,
    type: string,
    payload: unknown = {},
    commandId = UUID,
  ): Promise<CommandResult> {
    return socket.emitWithAck(GAME_COMMAND, { commandId, type, payload })
  }

  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

  /** Seats nobody who has sat at an earlier table in this process. */
  function seats(...names: string[]): string[] {
    tables += 1
    return names.map((name) => `${name}-${tables}`)
  }

  /** A dealt table with every seat already arrived, so started; also who moves first. */
  function liveTable(accountIds: string[]): {
    running: RunningGame
    active: string
  } {
    const running = registry.create(seated(accountIds), 'default')
    for (const accountId of accountIds) registry.arrive(running, accountId)
    const active = playerView(running.game, accountIds[0]).currentPlayerId!
    return { running, active }
  }

  function gameStarted(socket: Socket): Promise<GameSnapshot> {
    return new Promise((resolve) => socket.once(GAME_STARTED, resolve))
  }

  const handOf = (running: RunningGame, accountId: string) =>
    playerView(running.game, accountId).hand.length

  describe('the handshake', () => {
    it('refuses a socket with no session cookie', async () => {
      await expect(connect()).rejects.toThrow('Authentication required')
    })

    it('refuses a session the lobby does not know', async () => {
      await expect(connect('stale')).rejects.toThrow('Authentication required')
    })

    it('refuses an account seated at no table — there are no spectators', async () => {
      await expect(connect(tokenOf('stranger'))).rejects.toThrow(
        'No game assigned',
      )
    })

    it('seats an account at its table', async () => {
      const [alice, bob] = seats('alice', 'bob')
      liveTable([alice, bob])

      const socket = await connect(tokenOf(alice))

      expect(socket.connected).toBe(true)
    })
  })

  describe('commands', () => {
    it('runs a command as the authenticated account and acks it', async () => {
      const { running, active } = liveTable(seats('alice', 'bob'))
      const before = handOf(running, active)

      const socket = await connect(tokenOf(active))
      const ack = await send(socket, 'DrawCard')

      expect(ack).toEqual({ commandId: UUID, accepted: true })
      expect(handOf(running, active)).toBe(before + 1)
    })

    it("carries the engine's refusal back by name", async () => {
      const table = seats('alice', 'bob')
      const { active } = liveTable(table)
      const waiting = table.find((id) => id !== active)!

      const socket = await connect(tokenOf(waiting))
      const ack = await send(socket, 'DrawCard')

      expect(ack).toEqual({
        commandId: UUID,
        accepted: false,
        reason: RefusalReason.NotYourTurn,
      })
    })

    it('answers a retried command id from memory and executes it once', async () => {
      const { running, active } = liveTable(seats('alice', 'bob'))
      const before = handOf(running, active)

      const socket = await connect(tokenOf(active))
      const first = await send(socket, 'DrawCard', {}, UUID)
      const retry = await send(socket, 'DrawCard', {}, UUID)
      const fresh = await send(socket, 'DrawCard', {}, UUID_2)

      expect(retry).toEqual(first)
      expect(fresh).toEqual({ commandId: UUID_2, accepted: true })
      expect(handOf(running, active)).toBe(before + 2)
    })

    it('remembers the answer across a reconnect — the retry that matters', async () => {
      const { running, active } = liveTable(seats('alice', 'bob'))
      const before = handOf(running, active)

      const first = await connect(tokenOf(active))
      await send(first, 'DrawCard', {}, UUID)
      first.disconnect()
      const again = await connect(tokenOf(active))
      const retry = await send(again, 'DrawCard', {}, UUID)

      expect(retry).toEqual({ commandId: UUID, accepted: true })
      expect(handOf(running, active)).toBe(before + 1)
    })

    it('answers a malformed envelope with InternalError and keeps the socket', async () => {
      const { active } = liveTable(seats('alice', 'bob'))

      const socket = await connect(tokenOf(active))
      const malformed = await socket.emitWithAck(GAME_COMMAND, {
        commandId: 'not-a-uuid',
        type: 'DrawCard',
      })

      expect(malformed).toEqual({
        commandId: 'not-a-uuid',
        accepted: false,
        error: INTERNAL_ERROR,
      })
      expect(socket.connected).toBe(true)
      await expect(send(socket, 'DrawCard')).resolves.toMatchObject({
        accepted: true,
      })
    })

    it('is followed by one snapshot to every seat, each its own view', async () => {
      const table = seats('alice', 'bob')
      const { running, active } = liveTable(table)
      const waiting = table.find((id) => id !== active)!
      const snapshots: Record<string, Promise<GameSnapshot>> = {}
      const listen = (id: string) => (socket: Socket) => {
        snapshots[id] = new Promise((resolve) =>
          socket.once(GAME_SNAPSHOT, resolve),
        )
      }
      const actor = await connect(tokenOf(active), listen(active))
      await connect(tokenOf(waiting), listen(waiting))
      const before = running.version

      await send(actor, 'DrawCard')
      const [mine, theirs] = await Promise.all([
        snapshots[active],
        snapshots[waiting],
      ])

      expect(mine.version).toBe(before + 1)
      expect(theirs.version).toBe(before + 1)
      expect(mine.state).toEqual(playerView(running.game, active))
      expect(theirs.state).toEqual(playerView(running.game, waiting))
      expect(mine.state.hand).toHaveLength(6)
      expect(
        theirs.state.seats.find((s) => s.playerId === active)?.handCount,
      ).toBe(6)
    })

    it('keeps two tables in one process apart', async () => {
      const first = liveTable(seats('alice', 'bob'))
      const second = liveTable(seats('carol', 'dave'))
      const hands = (table: RunningGame) =>
        table.game.playerOrder.map((id) => handOf(table, id))
      const firstHands = hands(first.running)

      const socket = await connect(tokenOf(second.active))
      await expect(send(socket, 'DrawCard')).resolves.toMatchObject({
        accepted: true,
      })

      expect(hands(first.running)).toEqual(firstHands)
    })
  })

  describe('the start: Setup is the seats arriving', () => {
    it('starts the table on the arrival that completes it, telling every seat its own view', async () => {
      const [alice, bob, carol] = seats('alice', 'bob', 'carol')
      const { game } = registry.create(seated([alice, bob, carol]), 'default')
      const views: Record<string, Promise<GameSnapshot>> = {}
      const listen = (id: string) => (socket: Socket) => {
        views[id] = gameStarted(socket)
      }

      await connect(tokenOf(alice), listen(alice))
      await connect(tokenOf(bob), listen(bob))
      await sleep(50)
      expect(playerView(game, alice).phase).toBe(GamePhase.Setup)

      await connect(tokenOf(carol), listen(carol))
      const [a, b, c] = await Promise.all([views[alice], views[bob], views[carol]])

      expect(playerView(game, alice).phase).toBe(GamePhase.Turns)
      expect(a.state).toEqual(playerView(game, alice))
      expect(b.state).toEqual(playerView(game, bob))
      expect(c.state).toEqual(playerView(game, carol))
      expect([a, b, c].map((s) => s.state.playerId)).toEqual([alice, bob, carol])
      expect(new Set([a, b, c].map((s) => s.state.currentPlayerId)).size).toBe(1)
    })

    it('does not wait twice for a seat that arrived and left; it reconnects to a live table', async () => {
      const [alice, bob] = seats('alice', 'bob')
      const { game } = registry.create(seated([alice, bob]), 'default')

      const first = await connect(tokenOf(alice))
      first.disconnect()
      let bobsView!: Promise<GameSnapshot>
      await connect(tokenOf(bob), (socket) => {
        bobsView = gameStarted(socket)
      })
      await bobsView

      expect(playerView(game, alice).phase).toBe(GamePhase.Turns)
      let alicesView!: Promise<GameSnapshot>
      await connect(tokenOf(alice), (socket) => {
        alicesView = gameStarted(socket)
      })
      expect((await alicesView).state).toEqual(playerView(game, alice))
    })
  })

  describe('the end, and leaving', () => {
    /** Wins a quick-win table over the sockets; returns the seats' sockets. */
    async function winOverSockets(table: string[]) {
      const running = dealQuickWin(registry, table)
      const ends: Record<string, Promise<GameSnapshot>> = {}
      const at: Record<string, Socket> = {}
      for (const id of table) {
        at[id] = await connect(tokenOf(id), (socket) => {
          ends[id] = new Promise((resolve) =>
            socket.once(GAME_COMPLETED, resolve),
          )
        })
      }
      const active = playerView(running.game, table[0]).currentPlayerId!

      await expect(
        send(at[active], 'PlayHero', { cardId: heroInHand(running.game, active) }),
      ).resolves.toMatchObject({ accepted: true })
      await untilIdle(running.game)
      await expect(send(at[active], 'EndTurn', {}, UUID_2)).resolves.toMatchObject({
        accepted: true,
      })

      return { running, at, ends }
    }

    it('announces the end to every seat as game-completed with the final board', async () => {
      const table = seats('alice', 'bob')
      const { running, ends } = await winOverSockets(table)

      const [a, b] = await Promise.all(table.map((id) => ends[id]))

      expect(a.state.phase).toBe(GamePhase.Concluded)
      expect(a.version).toBe(running.version)
      expect(b.version).toBe(running.version)
      expect(a.state).toEqual(playerView(running.game, table[0]))
      expect(b.state).toEqual(playerView(running.game, table[1]))
    })

    it('refuses LeaveGame while the table is live', async () => {
      const { active } = liveTable(seats('alice', 'bob'))

      const socket = await connect(tokenOf(active))

      await expect(send(socket, 'LeaveGame')).resolves.toEqual({
        commandId: UUID,
        accepted: false,
        reason: RefusalReason.GameNotOver,
      })
    })

    it('lets every seat leave after the end, then forgets the table', async () => {
      const table = seats('alice', 'bob')
      const { running, at, ends } = await winOverSockets(table)
      await Promise.all(table.map((id) => ends[id]))
      const LEAVE = '33333333-3333-4333-8333-333333333333'

      await expect(send(at[table[0]], 'LeaveGame', {}, LEAVE)).resolves.toEqual({
        commandId: LEAVE,
        accepted: true,
      })
      expect(registry.get(running.game.gameId)).toBe(running)

      await expect(send(at[table[1]], 'LeaveGame', {}, LEAVE)).resolves.toEqual({
        commandId: LEAVE,
        accepted: true,
      })
      expect(registry.get(running.game.gameId)).toBeUndefined()
      // A retry of the leave that emptied the table is still answered.
      await expect(send(at[table[1]], 'LeaveGame', {}, LEAVE)).resolves.toEqual({
        commandId: LEAVE,
        accepted: true,
      })
      // And the seats belong to no table now: the lobby has them back.
      at[table[0]].disconnect()
      await expect(connect(tokenOf(table[0]))).rejects.toThrow('No game assigned')
    })
  })

  describe('what a seat is told on arrival', () => {
    it('resends a live table whole as game-started, seen from that seat only', async () => {
      const [alice, bob] = seats('alice', 'bob')
      const { running } = liveTable([alice, bob])

      let arrived!: Promise<GameSnapshot>
      await connect(tokenOf(alice), (socket) => {
        arrived = gameStarted(socket)
      })
      const { gameId, version, state } = await arrived

      expect(gameId).toBe(running.game.gameId)
      // The start's own events were flushed already; the resend says so.
      expect(version).toBe(running.version)
      expect(version).toBeGreaterThan(0)
      expect(state.playerId).toBe(alice)
      expect(state.phase).toBe(GamePhase.Turns)
      expect(state.hand).toHaveLength(5)
      expect(state.seats.find((seat) => seat.playerId === bob)?.handCount).toBe(
        5,
      )
      expect(state).toEqual(playerView(running.game, alice))
    })

    it('tells a seat still waiting for the others nothing', async () => {
      const [alice, bob] = seats('alice', 'bob')
      registry.create(seated([alice, bob]), 'default')
      let heard = false

      await connect(tokenOf(bob), (socket) => {
        socket.on(GAME_STARTED, () => {
          heard = true
        })
      })
      await sleep(100)

      expect(heard).toBe(false)
    })
  })
})
