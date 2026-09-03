import { Injectable } from '@nestjs/common'
import { GAME_SNAPSHOT } from 'shared'
import type { GameSnapshot, IGameEvent, IGameEventListener } from 'shared'
import type { Server } from 'socket.io'
import { playerView } from '../game/views/player-view'
import type { RunningGame } from './game-registry.service'
import { seatRoom } from './seat'

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
// ---------------------------------------------------------------------------

@Injectable()
export class SnapshotPublisherService {
  private server?: Server

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
    running.game.emitter.addListener(new Watcher(() => this.push(running)))
  }

  private push(running: RunningGame): void {
    if (!this.server) {
      throw new Error('snapshot flushed before the gateway bound its server')
    }
    running.version += 1
    for (const accountId of running.game.playerOrder) {
      this.server
        .to(seatRoom({ gameId: running.game.gameId, accountId }))
        .emit(GAME_SNAPSHOT, snapshotOf(running, accountId))
    }
  }
}

class Watcher implements IGameEventListener {
  private pending = false

  constructor(private readonly flush: () => void) {}

  onEvent(_event: IGameEvent): void {
    if (this.pending) return
    this.pending = true
    setImmediate(() => {
      this.pending = false
      this.flush()
    })
  }
}
