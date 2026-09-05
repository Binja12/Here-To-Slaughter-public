import { Inject, Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { OnGatewayConnection, OnGatewayInit } from '@nestjs/websockets'
import {
  GAME_COMMAND,
  GAME_STARTED,
  GAME_CONNECTED,
  GamePhase,
  INTERNAL_ERROR,
  LeaveGameSchema,
} from 'shared'
import type { CommandResult } from 'shared'
import type { Server, Socket } from 'socket.io'
import { SESSION_COOKIE_NAME } from '../auth/session-cookie'
import { playerView } from '../game/views/player-view'
import {
  CommandDispatcherService,
  commandIdOf,
} from './command-dispatcher.service'
import { CommandLedger } from './command-ledger'
import { GameRegistryService } from './game-registry.service'
import type { RunningGame } from './game-registry.service'
import { gameServerCors } from './game-server.config'
import { seatRoom } from './seat'
import type { Seat } from './seat'
import { GAME_SESSION_RESOLVER } from './session/game-session.resolver'
import type { IGameSessionResolver } from './session/game-session.resolver'
import { readCookie } from './session/handshake-cookie'
import {
  SnapshotPublisherService,
  snapshotOf,
} from './snapshot-publisher.service'

type SeatSocket = Socket & { data: { seat?: Seat } }

// Handshake refusals. Wording matches the lobby's HTTP guard where the
// situation is the same.
const AUTHENTICATION_REQUIRED = 'Authentication required'
const NO_GAME_ASSIGNED = 'No game assigned'
const LOBBY_UNAVAILABLE = 'Lobby unavailable'

// ---------------------------------------------------------------------------
// The browser's door into a game. The gateway holds no rules: identity is
// resolved ONCE, at the handshake, and bound to the socket; every command
// after that is the dispatcher's, run as that account; what a seat may see
// is `playerView`'s. Three jobs, in the order a connection meets them:
//
//   1. Seat the socket — cookie -> account -> the table it was dealt into,
//      or refuse. Done in Socket.IO middleware, BEFORE the connection exists,
//      so a rejected browser gets `connect_error` with the reason and a
//      seated one can never send a command unseated. No spectators.
//   2. Welcome it — join the seat's room and record the arrival. `Setup` is
//      the time the seats are arriving: the arrival that completes the table
//      starts the game, and every seat hears `game-started` with its own
//      first snapshot. An arrival at a live table is a reconnect and gets the
//      current snapshot as `game-started` — the view is whole state, so a
//      resend is a replay. A seat still waiting for the others hears nothing.
//   3. Answer commands — dedupe by command id, dispatch, ack truthfully.
//      `LeaveGame` is the one command that is not the dispatcher's: it is
//      the registry's, and only a concluded table accepts it.
//
// Pushing snapshots after the board changes is the publisher's job, not
// this file's; the gateway only hands it the server it pushes through.
// ---------------------------------------------------------------------------

@WebSocketGateway({ cors: gameServerCors })
export class GameGateway implements OnGatewayInit<Server>, OnGatewayConnection {
  private readonly logger = new Logger(GameGateway.name)
  private readonly ledger = new CommandLedger()

  @WebSocketServer()
  private readonly server!: Server

  constructor(
    private readonly registry: GameRegistryService,
    private readonly dispatcher: CommandDispatcherService,
    private readonly publisher: SnapshotPublisherService,
    @Inject(GAME_SESSION_RESOLVER)
    private readonly sessions: IGameSessionResolver,
  ) {}

  afterInit(server: Server): void {
    this.publisher.bind(server)
    server.use((socket: SeatSocket, next) => {
      this.seat(socket).then(
        (seat) => {
          socket.data.seat = seat
          next()
        },
        (error: Error) => next(error),
      )
    })
  }

  /** Runs after the middleware, so the seat is always bound here. */
  handleConnection(socket: SeatSocket): void {
    const seat = socket.data.seat
    if (!seat) return
    void socket.join(seatRoom(seat))

    const running = this.registry.get(seat.gameId)
    if (!running) return

    const config = running.game.config
    socket.emit(GAME_CONNECTED, {
      gameId: running.game.gameId,
      config: {
        actionPointsPerTurn: config.actionPointsPerTurn,
        cardSets: config.cardSets,
        turnTimeMs: config.timeControl.turnTimeMs,
        reactionTimeMs: config.timeControl.reactionCountdownMs,
        seamlessReactions: config.seamlessReactions,
        requireAllWinConditions: config.requireAllWinConditions,
        winConditions: config.winConditions,
      },
    })

    if (this.registry.arrive(running, seat.accountId)) {
      // The last seat is in: the table just started, and everybody — this
      // socket included, through its room — gets their own first look.
      for (const accountId of running.game.playerOrder) {
        this.server
          .to(seatRoom({ gameId: seat.gameId, accountId }))
          .emit(GAME_STARTED, snapshotOf(running, accountId))
      }
      return
    }

    if (playerView(running.game, seat.accountId).phase === GamePhase.Setup) {
      return
    }
    socket.emit(GAME_STARTED, snapshotOf(running, seat.accountId))
  }

  @SubscribeMessage(GAME_COMMAND)
  handleCommand(
    @ConnectedSocket() socket: SeatSocket,
    @MessageBody() raw: unknown,
  ): CommandResult {
    const seat = socket.data.seat
    if (!seat) {
      throw new Error('command on an unseated socket: middleware was bypassed')
    }

    const room = seatRoom(seat)
    const commandId = commandIdOf(raw)
    // Memory first: a retried LeaveGame that emptied the table is answered
    // from here after the table is gone.
    const remembered = commandId && this.ledger.recall(room, commandId)
    if (remembered) return remembered

    const running = this.registry.get(seat.gameId)
    if (!running) {
      // The table is gone from under a still-connected seat. Not a
      // refusal — there is no game to refuse in — and not a crash.
      this.logger.warn(
        `command from ${seat.accountId} for missing game ${seat.gameId}`,
      )
      return { commandId, accepted: false, error: INTERNAL_ERROR }
    }

    const result = LeaveGameSchema.safeParse(raw).success
      ? this.leave(running, seat, commandId!)
      : this.dispatcher.dispatch(running.game, seat.accountId, raw)
    if (commandId) this.ledger.remember(room, commandId, result)
    return result
  }

  /** Out of a concluded table, and out of this seat's memory but for this answer. */
  private leave(
    running: RunningGame,
    seat: Seat,
    commandId: string,
  ): CommandResult {
    const result = this.registry.leave(running, seat.accountId)
    if (result.accepted) this.ledger.forget(seatRoom(seat))
    return { commandId, ...result }
  }

  /**
   * Who is at the door and where they sit. Throws the refusal the browser
   * is told; the resolver's own throw (a lobby outage) is logged in full and
   * reported as such, never as a player being turned away.
   */
  private async seat(socket: SeatSocket): Promise<Seat> {
    const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE_NAME)
    if (!token) throw new Error(AUTHENTICATION_REQUIRED)

    let account
    try {
      account = await this.sessions.resolve(token)
    } catch (error) {
      this.logger.error(
        'could not resolve a session with the lobby',
        error instanceof Error ? error.stack : String(error),
      )
      throw new Error(LOBBY_UNAVAILABLE)
    }
    if (!account) throw new Error(AUTHENTICATION_REQUIRED)

    const running = this.registry.findByAccount(account.accountId)
    if (!running) throw new Error(NO_GAME_ASSIGNED)

    return { gameId: running.game.gameId, accountId: account.accountId }
  }
}
