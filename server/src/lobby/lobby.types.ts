import type { GameSettings } from 'shared'

export type LobbyPlayer = {
  accountId: string
  username: string
}

export type LobbyPlayerState = 'IDLE' | 'READY' | 'IN_GAME'

export type LobbySnapshot = {
  readyPlayers: LobbyPlayer[]
  /** The table as the host has set it; `playerCount` is how many may be ready. */
  settings: GameSettings
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

export type StartGameResponse = {
  gameId: string
  status: 'STARTING'
}

export type GameAssignedEventData = {
  gameId: string
  webSocketUrl: string
}

export type LobbySseEvent =
  | {
      type: 'lobby-updated'
      data: LobbySnapshot
    }
  | {
      type: 'game-assigned'
      data: GameAssignedEventData
    }
