import { Injectable } from '@nestjs/common'
import { GamePhase } from 'shared'
import type { GameConfig, GameConfigId } from 'shared'
import { defaultGameConfig } from '../game/config/game-config'
import { createGame, startGame } from '../game/setup/create-game'
import type { Game } from '../game/setup/create-game'
import { playerView } from '../game/views/player-view'
import { SnapshotPublisherService } from './snapshot-publisher.service'

/**
 * Every config id the wire may name, and the config it stands for. Keyed by
 * the schema's enum, so a new id on the wire is a compile error until it has
 * a config here.
 */
const GAME_CONFIGS: Record<GameConfigId, GameConfig> = {
  default: defaultGameConfig,
}

/**
 * One session this process hosts: the engine's game plus what the transport
 * knows about it and the engine does not. Data, not behaviour — the gateway
 * and the publisher drive it. Who is seated is not stored here: it is
 * `game.playerOrder`, and whether the table has started is on the board
 * (`PlayerView.phase`), so neither can go stale.
 */
export type RunningGame = {
  game: Game
  /**
   * Seats that have connected at least once. `Setup` is the time the seats
   * are arriving, and the table starts on the arrival that completes it. A
   * seat that arrived and dropped still counts — the table does not wait
   * for it twice; it reconnects to a live game.
   */
  arrived: Set<string>
  /**
   * Bumped by the snapshot publisher on every flush, sent with every
   * snapshot so a client can keep the newest of two that crossed.
   */
  version: number
}

// ---------------------------------------------------------------------------
// The sessions this process hosts, keyed by game id. One process holds many
// tables; a browser is routed to its own by the ACCOUNT the lobby seated,
// never by game id and never by port — a socket arrives knowing only who it
// is, and the table is found from that.
//
// Reaches the engine only through `createGame`, `startGame` and the `Game`
// they hand back, and reads it through `playerView`.
// ---------------------------------------------------------------------------

@Injectable()
export class GameRegistryService {
  private readonly games = new Map<string, RunningGame>()

  constructor(private readonly publisher: SnapshotPublisherService) {}

  /**
   * Deals a table seating exactly these accounts and holds it. NOT started:
   * the first turn is a point of no return, and it waits for every seat to
   * arrive (`arrive`). Watched from birth: the publisher's listener joins
   * the emitter here, so no event of the table's life goes unobserved.
   */
  create(accountIds: readonly string[], configId: GameConfigId): RunningGame {
    const game = createGame(accountIds, { config: GAME_CONFIGS[configId] })
    const running: RunningGame = { game, arrived: new Set(), version: 0 }
    this.games.set(game.gameId, running)
    this.publisher.watch(running)
    return running
  }

  get(gameId: string): RunningGame | undefined {
    return this.games.get(gameId)
  }

  /**
   * The table an account is seated at. The lobby never seats one account at
   * two tables at once (`AccountAlreadyInGameError`), so the first match is
   * the only one.
   */
  findByAccount(accountId: string): RunningGame | undefined {
    for (const running of this.games.values()) {
      if (running.game.playerOrder.includes(accountId)) return running
    }
    return undefined
  }

  /**
   * Records that a seat has connected. Returns true exactly once per table:
   * on the arrival that seats the last player, which is when the first turn
   * begins. Every later arrival is a reconnect to a live table, and every
   * earlier one is a seat waiting for the others.
   *
   * A seat that never arrives holds the table in `Setup` for ever; the
   * no-show timer that abandons it is deferred (plan §10).
   */
  arrive(running: RunningGame, accountId: string): boolean {
    running.arrived.add(accountId)

    const { game } = running
    if (playerView(game, accountId).phase !== GamePhase.Setup) return false
    if (!game.playerOrder.every((seat) => running.arrived.has(seat))) {
      return false
    }

    startGame(game)
    return true
  }
}
