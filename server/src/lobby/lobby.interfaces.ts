import { GameAssignment, LobbyPlayer } from './lobby.types'
import type {
  CreateGameRequest,
  CreateGameResult,
  GameSettings,
} from 'shared'

export const LOBBY_STORE = Symbol('ILobbyStore')
export const GAME_ASSIGNMENT_STORE = Symbol('IGameAssignmentStore')
export const GAME_SERVER_CLIENT = Symbol('IGameServerClient')

export interface ILobbyStore {
  getReadyPlayers(): Promise<LobbyPlayer[]>
  getSettings(): Promise<GameSettings>
  updateSettings(settings: GameSettings): Promise<void>
  /** THROWS `LobbyFullError` at the settings' seat count. */
  addReadyPlayer(player: LobbyPlayer): Promise<void>
  removeReadyPlayer(accountId: string): Promise<boolean>
  removeReadyPlayers(accountIds: readonly string[]): Promise<number>
}

export interface IGameAssignmentStore {
  assign(assignments: readonly GameAssignment[]): Promise<void>
  findByAccountId(accountId: string): Promise<GameAssignment | undefined>
  findByGameId(gameId: string): Promise<GameAssignment[]>
  removeByAccountId(accountId: string): Promise<boolean>
  removeByGameId(gameId: string): Promise<number>
}

export interface IGameServerClient {
  createGame(request: CreateGameRequest): Promise<CreateGameResult>
}
