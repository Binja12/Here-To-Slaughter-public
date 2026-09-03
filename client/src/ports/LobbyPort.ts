import {
  Account,
  Credentials,
  GameAssigned,
  LobbySnapshot,
  StartGameResult,
} from '../contract'

export type LobbyEvents = {
  onLobbyUpdated: (snapshot: LobbySnapshot) => void
  onGameAssigned: (assignment: GameAssigned) => void
  onFailure?: (reason: string) => void
}

export interface LobbyPort {
  register(credentials: Credentials): Promise<Account>
  login(credentials: Credentials): Promise<Account>
  logout(): Promise<void>
  getLobby(): Promise<LobbySnapshot>
  ready(): Promise<LobbySnapshot>
  unready(): Promise<LobbySnapshot>
  startGame(): Promise<StartGameResult>
  subscribe(events: LobbyEvents): () => void
}

export class LobbyPortError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'LobbyPortError'
  }
}
