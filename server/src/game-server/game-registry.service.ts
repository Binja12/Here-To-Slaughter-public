import { Injectable } from '@nestjs/common'
import type { GameConfig, GameConfigId } from 'shared'
import { defaultGameConfig } from '../game/config/game-config'
import { createGame } from '../game/setup/create-game'
import type { Game } from '../game/setup/create-game'

/**
 * Every config id the wire may name, and the config it stands for. Keyed by
 * the schema's enum, so a new id on the wire is a compile error until it has
 * a config here.
 */
const GAME_CONFIGS: Record<GameConfigId, GameConfig> = {
  default: defaultGameConfig,
}

// ---------------------------------------------------------------------------
// The sessions this process hosts, keyed by game id. One process holds many
// tables; a browser is routed to its own by game id, never by port.
//
// Reaches the engine only through `createGame` and the `Game` it hands back.
// ---------------------------------------------------------------------------

@Injectable()
export class GameRegistryService {
  private readonly games = new Map<string, Game>()

  /**
   * Deals a table seating exactly these accounts and holds it. NOT started:
   * the first turn is a point of no return, and it waits for the seats to
   * connect (`startGame` in `setup/create-game.ts`).
   */
  create(accountIds: readonly string[], configId: GameConfigId): Game {
    const game = createGame(accountIds, { config: GAME_CONFIGS[configId] })
    this.games.set(game.gameId, game)
    return game
  }

  get(gameId: string): Game | undefined {
    return this.games.get(gameId)
  }
}
