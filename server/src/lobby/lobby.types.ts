export const MIN_GAME_PLAYERS = 2
export const LOBBY_CAPACITY = 4

export type LobbyPlayer = {
  accountId: string
  username: string
}

export type LobbyPlayerState = 'IDLE' | 'READY' | 'IN_GAME'

export type LobbySnapshot = {
  readyPlayers: LobbyPlayer[]
  self: LobbyPlayer & {
    state: LobbyPlayerState
    isHost: boolean
  }
}

export type GameAssignment = {
  accountId: string
  gameId: string
  webSocketUrl: string
  assignedAt: Date
}
