export type LobbyPlayer = {
  accountId: string
  username: string
}

export type GameAssignment = {
  accountId: string
  gameId: string
  webSocketUrl: string
  assignedAt: Date
}
