import {
  Account,
  Credentials,
  GameAssigned,
  GameSettings,
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
  /** Host only. The whole object every time; the server answers with the lobby as it now stands. */
  updateSettings(settings: GameSettings): Promise<LobbySnapshot>
  startGame(): Promise<StartGameResult>
  subscribe(events: LobbyEvents): () => void
}

export class LobbyPortError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'LobbyPortError'
  }
}
