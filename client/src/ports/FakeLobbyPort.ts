import {
  Account,
  Credentials,
  DEFAULT_GAME_SETTINGS,
  GameAssigned,
  GameSettings,
  LobbyPlayer,
  LobbySnapshot,
  StartGameResult,
} from '../contract'
import { LobbyEvents, LobbyPort, LobbyPortError } from './LobbyPort'

const BOTS: LobbyPlayer[] = [
  { accountId: 'account-mira', username: 'Mira' },
  { accountId: 'account-rook', username: 'Rook' },
  { accountId: 'account-ember', username: 'Ember' },
]

export class FakeLobbyPort implements LobbyPort {
  private self: Account | null = null
  private readyPlayers: LobbyPlayer[] = []
  private settings: GameSettings = { ...DEFAULT_GAME_SETTINGS }
  private subscribers = new Set<LobbyEvents>()

  async register(credentials: Credentials): Promise<Account> {
    return this.authenticate(credentials)
  }

  async login(credentials: Credentials): Promise<Account> {
    return this.authenticate(credentials)
  }

  async logout(): Promise<void> {
    this.self = null
    this.readyPlayers = []
  }

  async getLobby(): Promise<LobbySnapshot> {
    return this.snapshot()
  }

  async ready(): Promise<LobbySnapshot> {
    const self = this.requireSelf()
    if (!this.readyPlayers.some((player) => player.accountId === self.accountId)) {
      this.readyPlayers = this.seat(self)
    }
    return this.publish()
  }

  async unready(): Promise<LobbySnapshot> {
    const self = this.requireSelf()
    this.readyPlayers = this.readyPlayers.filter(
      (player) => player.accountId !== self.accountId,
    )
    return this.publish()
  }

  /** The server's rule: host only; a closed seat unseats whoever sat in it. */
  async updateSettings(settings: GameSettings): Promise<LobbySnapshot> {
    const snapshot = this.snapshot()
    if (!snapshot.self.isHost) throw new LobbyPortError('Only the host can change the settings')
    this.settings = { ...settings }
    this.readyPlayers = this.readyPlayers.slice(0, settings.playerCount)
    return this.publish()
  }

  async startGame(): Promise<StartGameResult> {
    const snapshot = this.snapshot()
    if (!snapshot.self.isHost || snapshot.readyPlayers.length < 2) {
      throw new LobbyPortError('NotEnoughReadyPlayers')
    }
    const result: StartGameResult = { gameId: 'fake-game', status: 'STARTING' }
    window.setTimeout(() => {
      const assignment: GameAssigned = {
        gameId: result.gameId,
        webSocketUrl: 'fake://game/fake-game',
      }
      this.subscribers.forEach((subscriber) =>
        subscriber.onGameAssigned(assignment),
      )
    }, 350)
    return result
  }

  subscribe(events: LobbyEvents): () => void {
    this.subscribers.add(events)
    return () => this.subscribers.delete(events)
  }

  private authenticate(credentials: Credentials): Account {
    const username = credentials.username.trim()
    if (!username || credentials.password.length < 1) {
      throw new LobbyPortError('UsernameAndPasswordRequired')
    }
    this.self = { accountId: 'account-self', username }
    this.readyPlayers = this.seat(this.self)
    return this.self
  }

  /** The viewer first (host), then as many bots as the table still seats. */
  private seat(self: Account): LobbyPlayer[] {
    return [self, ...BOTS].slice(0, this.settings.playerCount)
  }

  private requireSelf(): Account {
    if (!this.self) throw new LobbyPortError('Unauthorized')
    return this.self
  }

  private snapshot(): LobbySnapshot {
    const self = this.requireSelf()
    const ready = this.readyPlayers.some(
      (player) => player.accountId === self.accountId,
    )
    return {
      readyPlayers: this.readyPlayers.map((player) => ({ ...player })),
      settings: { ...this.settings },
      self: {
        ...self,
        state: ready ? 'READY' : 'IDLE',
        isHost: this.readyPlayers[0]?.accountId === self.accountId,
      },
    }
  }

  private publish(): LobbySnapshot {
    const snapshot = this.snapshot()
    this.subscribers.forEach((subscriber) =>
      subscriber.onLobbyUpdated(snapshot),
    )
    return snapshot
  }
}
