export type Account = { accountId: string; username: string }

export type Credentials = { username: string; password: string }

export type LobbyPlayer = { accountId: string; username: string }

export type LobbySnapshot = {
  readyPlayers: LobbyPlayer[]
  settings: { gameConfig: 'default' }
  self: LobbyPlayer & {
    state: 'IDLE' | 'READY' | 'IN_GAME'
    isHost: boolean
  }
}

export type StartGameResult = { gameId: string; status: 'STARTING' }

export type GameAssigned = { gameId: string; webSocketUrl: string }

export type LobbyFailure = { reason: string }
