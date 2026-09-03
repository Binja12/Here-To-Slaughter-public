import { Inject, Injectable, Logger } from '@nestjs/common'
import type { ClientProxy } from '@nestjs/microservices'
import {
  GAME_COMPLETED,
  GAME_COMPLETED_PATTERN,
  GAME_SNAPSHOT,
  GameEventType,
} from 'shared'
import type {
  GameCompletedEvent,
  GameSnapshot,
  IGameEvent,
  IGameEventListener,
} from 'shared'
import type { Server } from 'socket.io'
import { playerView } from '../game/views/player-view'
import type { RunningGame } from './game-registry.service'
import { seatRoom } from './seat'
import { LOBBY_TCP_CLIENT } from './session/tcp-session.resolver'

/** One seat's view of the table in the envelope it travels in. */
export function snapshotOf(running: RunningGame, accountId: string): GameSnapshot {
  return {
    gameId: running.game.gameId,
    version: running.version,
    state: playerView(running.game, accountId),
  }
}

// ---------------------------------------------------------------------------
// The view's observer: the piece that makes socket MVC push rather than
// pull (plan §2). One listener per game on the game's own emitter, added at
// the table's birth, doing two things at two moments:
//
//   mark  — on EVERY event, synchronously: the board may have changed, so
//           a flush is due if none is already on its way. No filtering by
//           event type; which changes a seat may see is the view's
//           knowledge, and a copy here could only disagree with it. The
//           engine guarantees nothing moves the board silently, so "an
//           event fired" and "the board may differ" are one condition.
//   flush — on the next turn of the event loop (`setImmediate`), once per
//           burst: version + 1, one `playerView` per seat, one push per
//           seat's room. Emission is synchronous and re-entrant, so a
//           snapshot taken INSIDE an event can catch the board between two
//           halves of one step; the flush waits until the stack that
//           entered the engine has unwound, which is the first moment the
//           engine is at rest — idle, or paused on a window a player must
//           answer. A command that emits ten events costs one snapshot per
//           seat; a window lapsing on its timer produces a push with no
//           command at all; a refused command emits nothing and pushes
//           nothing.
//
// The burst is not tracked. Node runs each entry — a socket message, a timer
// — as one uninterrupted stack, and `setImmediate` cannot run until it has
// unwound; one flag, "a flush is on its way", is the whole mechanism. A
// second flag for "something happened during the flush" would only matter
// if flushing could emit engine events, and building views cannot.
//
// The end is the one event the watcher reads by name. `GameEnded` fires
// once, in the burst that concluded the table, and the flush that follows
// pushes the final board as `game-completed` INSTEAD of `game:snapshot` —
// same envelope, same version rule, and the event name is what tells a
// screen to show the result — then tells the lobby, which clears the seats'
// assignments so they may sit down again.
// ---------------------------------------------------------------------------

@Injectable()
export class SnapshotPublisherService {
  private readonly logger = new Logger(SnapshotPublisherService.name)
  private server?: Server

  constructor(
    @Inject(LOBBY_TCP_CLIENT)
    private readonly lobby: ClientProxy,
  ) {}

  /** The gateway owns the Socket.IO server and hands it over once, at init. */
  bind(server: Server): void {
    this.server = server
  }

  /**
   * Adds the game's one listener. After `createGame`, so after `TaskManager`
   * and `GameEngine` on the emitter — the engine doc's ordering rule (§8)
   * is about those two; this one only reads, and last is fine.
   */
  watch(running: RunningGame): void {
    running.game.emitter.addListener(
      new Watcher((completed) => this.push(running, completed)),
    )
  }

  private push(running: RunningGame, completed: boolean): void {
    if (!this.server) {
      throw new Error('snapshot flushed before the gateway bound its server')
    }
    running.version += 1

    const event = completed ? GAME_COMPLETED : GAME_SNAPSHOT
    const gameId = running.game.gameId
    for (const accountId of running.game.playerOrder) {
      this.server
        .to(seatRoom({ gameId, accountId }))
        .emit(event, snapshotOf(running, accountId))
    }

    if (completed) this.tellLobby(gameId)
  }

  /**
   * One-way, like the lobby's own `game.completed` listener expects. A lobby
   * that cannot be reached is logged, not thrown: the seats have their final
   * board either way, and the assignment is the lobby's to clear when it is
   * back. Retry is deferred with the rest of the outage story (plan §10).
   */
  private tellLobby(gameId: string): void {
    const event: GameCompletedEvent = { gameId }
    this.lobby.emit(GAME_COMPLETED_PATTERN, event).subscribe({
      error: (error: unknown) =>
        this.logger.error(
          `could not tell the lobby that ${gameId} completed`,
          error instanceof Error ? error.stack : String(error),
        ),
    })
  }
}

class Watcher implements IGameEventListener {
  private pending = false
  private ended = false

  constructor(private readonly flush: (completed: boolean) => void) {}

  onEvent(event: IGameEvent): void {
    if (event.getType() === GameEventType.GameEnded) this.ended = true
    if (this.pending) return
    this.pending = true
    setImmediate(() => {
      this.pending = false
      const completed = this.ended
      this.ended = false
      this.flush(completed)
    })
  }
}
