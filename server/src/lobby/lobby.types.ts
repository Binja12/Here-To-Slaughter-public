import type { GameConfigId } from 'shared'

export const MIN_GAME_PLAYERS = 2
export const LOBBY_CAPACITY = 4

export type LobbyPlayer = {
  accountId: string
  username: string
}

export type LobbyPlayerState = 'IDLE' | 'READY' | 'IN_GAME'

export type LobbySnapshot = {
  readyPlayers: LobbyPlayer[]
  settings: LobbySettings
  self: LobbyPlayer & {
    state: LobbyPlayerState
    isHost: boolean
  }
}

export type LobbySettings = {
  gameConfig: GameConfigId
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
