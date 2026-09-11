import {
  Account,
  Credentials,
  GameAssigned,
  GameSettings,
  LobbyFailure,
  LobbySnapshot,
  StartGameResult,
} from '../contract'
import { LobbyEvents, LobbyPort, LobbyPortError } from './LobbyPort'

const DEFAULT_LOBBY_URL = 'http://localhost:3000'

export class RealLobbyPort implements LobbyPort {
  constructor(
    private readonly baseUrl =
      process.env.REACT_APP_LOBBY_URL ?? DEFAULT_LOBBY_URL,
  ) {}

  register(credentials: Credentials) {
    return this.request<Account>('/register', 'POST', credentials)
  }

  login(credentials: Credentials) {
    return this.request<Account>('/login', 'POST', credentials)
  }

  async logout(): Promise<void> {
    await this.request<void>('/logout', 'POST')
  }

  getLobby() {
    return this.request<LobbySnapshot>('/lobby', 'GET')
  }

  ready() {
    return this.request<LobbySnapshot>('/lobby/ready', 'POST')
  }

  unready() {
    return this.request<LobbySnapshot>('/lobby/ready', 'DELETE')
  }

  updateSettings(settings: GameSettings) {
    return this.request<LobbySnapshot>('/lobby/settings', 'PUT', settings)
  }

  startGame() {
    return this.request<StartGameResult>('/lobby/start-game', 'POST')
  }

  subscribe(events: LobbyEvents): () => void {
    const source = new EventSource(`${this.baseUrl}/lobby/events`, {
      withCredentials: true,
    })
    const onLobby = (event: MessageEvent<string>) => {
      events.onLobbyUpdated(JSON.parse(event.data) as LobbySnapshot)
    }
    const onAssigned = (event: MessageEvent<string>) => {
      events.onGameAssigned(JSON.parse(event.data) as GameAssigned)
    }
    source.addEventListener('lobby-updated', onLobby as EventListener)
    source.addEventListener('game-assigned', onAssigned as EventListener)
    source.onerror = () => events.onFailure?.('Lobby updates disconnected.')
    return () => source.close()
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      const failure = (await response.json().catch(() => ({ reason: response.statusText }))) as LobbyFailure
      throw new LobbyPortError(failure.reason)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}
