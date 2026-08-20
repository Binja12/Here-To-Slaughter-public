import { GameAssignment, LobbyPlayer } from './lobby.types'

export const LOBBY_STORE = Symbol('ILobbyStore')
export const GAME_ASSIGNMENT_STORE = Symbol('IGameAssignmentStore')

export interface ILobbyStore {
  getReadyPlayers(): Promise<LobbyPlayer[]>
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
