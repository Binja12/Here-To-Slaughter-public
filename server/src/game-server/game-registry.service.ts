import { Inject, Injectable, Logger } from '@nestjs/common'
import { GamePhase, RefusalReason } from 'shared'
import type {
  CardBase,
  GameConfig,
  GameSettings,
  RequestResult,
  SeatedAccount,
} from 'shared'
import { accepted, refused } from '../game/interfaces'
import { createGame, startGame } from '../game/setup/create-game'
import type { Game } from '../game/setup/create-game'
import { playerView } from '../game/views/player-view'
import { GameLog } from '../game/views/game-log'
import { GAME_STORE } from './game.store'
import type { IGameStore } from './game.store'
import { SnapshotPublisherService } from './snapshot-publisher.service'
import { gameConfigFor } from './game-config-for'

/**
 * One session this process hosts: the engine's game plus what the transport
 * knows about it and the engine does not. Data, not behaviour — the gateway
 * and the publisher drive it. Who is seated is not stored here: it is
 * `game.playerOrder`; whether the table has started or ended is on the
 * board (`PlayerView.phase`); so neither can go stale.
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
   * Seats that have left the concluded table. When the last one has, the
   * table is forgotten.
   */
  left: Set<string>
  /**
   * Bumped by the snapshot publisher on every flush, sent with every
   * snapshot so a client can keep the newest of two that crossed.
   */
  version: number
  /** The table's story, recorded from birth; each seat reads its own wording. */
  log: GameLog
}

/**
 * A spec's hand on the deal: the printed pool and the config, the two
 * things `createGame` lets a caller fix. The wire never carries either — the
 * lobby sends the seats and the settings the config is built from — so this
 * is how a test seats a table it can predict (plan §6).
 */
export type Deal = {
  cards?: CardBase[]
  config?: GameConfig
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
  private readonly logger = new Logger(GameRegistryService.name)
  private readonly games = new Map<string, RunningGame>()

  constructor(
    private readonly publisher: SnapshotPublisherService,
    @Inject(GAME_STORE) private readonly store: IGameStore,
  ) {}

  /**
   * Deals a table seating exactly these accounts and holds it. NOT started:
   * the first turn is a point of no return, and it waits for every seat to
   * arrive (`arrive`). Watched from birth: the log and the publisher's
   * listener join the emitter here, so no event of the table's life goes
   * unobserved. The store hears of the table now and of every flush after;
   * a store that cannot be reached is logged, and the table plays on.
   */
  create(
    players: readonly SeatedAccount[],
    settings: GameSettings,
    deal: Deal = {},
  ): RunningGame {
    // Player ids ARE account ids; the username is only what a seat is called.
    const game = createGame(
      players.map((player) => player.accountId),
      {
        config: deal.config ?? gameConfigFor(settings),
        cards: deal.cards,
        names: Object.fromEntries(
          players.map((player) => [player.accountId, player.username]),
        ),
      },
    )
    const log = new GameLog(game.gameState)
    game.emitter.addListener(log)
    const running: RunningGame = {
      game,
      arrived: new Set(),
      left: new Set(),
      version: 0,
      log,
    }
    this.games.set(game.gameId, running)
    this.publisher.watch(running)
    this.store
      .create({
        gameId: game.gameId,
        createdAt: new Date(),
        seats: game.playerOrder.map((accountId, seat) => ({
          accountId,
          username: players.find((p) => p.accountId === accountId)!.username,
          seat,
        })),
        settings,
        config: game.config,
      })
      .catch((error: unknown) =>
        this.logger.error(
          `could not store game ${game.gameId}`,
          error instanceof Error ? error.stack : String(error),
        ),
      )
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

  /**
   * A seat leaving a concluded table. Refused while the table is live — an
   * active player cannot walk out (contract §6). When the last seat has
   * left, the table is forgotten: a later handshake from any of its
   * accounts finds no game, which is right, because the lobby has already
   * cleared their assignments on `game.completed`.
   */
  leave(running: RunningGame, accountId: string): RequestResult {
    const { game } = running
    if (playerView(game, accountId).phase !== GamePhase.Concluded) {
      return refused(RefusalReason.GameNotOver)
    }

    running.left.add(accountId)
    if (game.playerOrder.every((seat) => running.left.has(seat))) {
      this.games.delete(game.gameId)
    }
    return accepted()
  }
}
