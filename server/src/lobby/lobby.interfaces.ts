import { GameAssignment, LobbyPlayer, LobbySettings } from './lobby.types'
import type { CreateGameRequest, CreateGameResult } from 'shared'

export const LOBBY_STORE = Symbol('ILobbyStore')
export const GAME_ASSIGNMENT_STORE = Symbol('IGameAssignmentStore')
export const GAME_SERVER_CLIENT = Symbol('IGameServerClient')

export interface ILobbyStore {
  getReadyPlayers(): Promise<LobbyPlayer[]>
  getSettings(): Promise<LobbySettings>
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
