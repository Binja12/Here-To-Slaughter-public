import { Inject, Injectable } from '@nestjs/common'
import type { Observable } from 'rxjs'
import { MIN_PLAYER_COUNT } from 'shared'
import type { GameSettings } from 'shared'
import type { AuthenticatedAccount } from '../auth/auth.types'
import {
  AccountAlreadyInGameError,
  GameServerUnavailableError,
  GameStartInProgressError,
  InvalidReadyPlayerCountError,
  LobbyFullError,
  OnlyHostCanChangeSettingsError,
  OnlyHostCanStartError,
} from './lobby.errors'
import {
  GAME_ASSIGNMENT_STORE,
  GAME_SERVER_CLIENT,
  LOBBY_STORE,
} from './lobby.interfaces'
import type {
  IGameAssignmentStore,
  IGameServerClient,
  ILobbyStore,
} from './lobby.interfaces'
import { LobbyEventStreamService } from './lobby-event-stream.service'
import type {
  GameAssignment,
  LobbyPlayer,
  LobbySnapshot,
  LobbySseEvent,
  StartGameResponse,
} from './lobby.types'

@Injectable()
export class LobbyService {
  private gameStartInProgress = false

  constructor(
    @Inject(LOBBY_STORE)
    private readonly lobby: ILobbyStore,
    @Inject(GAME_ASSIGNMENT_STORE)
    private readonly assignments: IGameAssignmentStore,
    @Inject(GAME_SERVER_CLIENT)
    private readonly gameServer: IGameServerClient,
    private readonly eventStream: LobbyEventStreamService,
  ) {}

  events(account: AuthenticatedAccount): Observable<LobbySseEvent> {
    return this.eventStream.open(account, async () => {
      const [snapshot, assignment] = await Promise.all([
        this.getSnapshot(account),
        this.assignments.findByAccountId(account.accountId),
      ])
      const events: LobbySseEvent[] = [
        { type: 'lobby-updated', data: snapshot },
      ]

      // Replay an active assignment when a browser reconnects to SSE.
      if (assignment) {
        events.push({
          type: 'game-assigned',
          data: {
            gameId: assignment.gameId,
            webSocketUrl: assignment.webSocketUrl,
          },
        })
      }
      return events
    })
  }

  async getSnapshot(account: AuthenticatedAccount): Promise<LobbySnapshot> {
    const [readyPlayers, settings, assignment] = await Promise.all([
      this.lobby.getReadyPlayers(),
      this.lobby.getSettings(),
      this.assignments.findByAccountId(account.accountId),
    ])
    const ready = readyPlayers.some(
      (player) => player.accountId === account.accountId,
    )

    // An active assignment takes priority over stale ready-list membership.
    const state = assignment ? 'IN_GAME' : ready ? 'READY' : 'IDLE'

    return {
      readyPlayers,
      settings,
      self: {
        accountId: account.accountId,
        username: account.username,
        state,
        // The first ready player is always the host.
        isHost:
          state === 'READY' && readyPlayers[0]?.accountId === account.accountId,
      },
    }
  }

  async ready(account: AuthenticatedAccount): Promise<LobbySnapshot> {
    // Players assigned to an active game cannot re-enter the ready list.
    if (await this.assignments.findByAccountId(account.accountId)) {
      throw new AccountAlreadyInGameError()
    }

    const readyPlayers = await this.lobby.getReadyPlayers()
    const alreadyReady = readyPlayers.some(
      (player) => player.accountId === account.accountId,
    )

    // Repeating a ready request is idempotent and does not change host order.
    if (!alreadyReady) {
      const { playerCount } = await this.lobby.getSettings()
      if (readyPlayers.length >= playerCount) {
        throw new LobbyFullError(playerCount)
      }
      await this.lobby.addReadyPlayer({
        accountId: account.accountId,
        username: account.username,
      })
    }

    const snapshot = await this.getSnapshot(account)
    if (!alreadyReady) await this.publishLobbyUpdated()
    return snapshot
  }

  async unready(account: AuthenticatedAccount): Promise<LobbySnapshot> {
    // Removing a missing player is idempotent.
    const removed = await this.lobby.removeReadyPlayer(account.accountId)
    const snapshot = await this.getSnapshot(account)
    if (removed) await this.publishLobbyUpdated()
    return snapshot
  }

  /** Host only. A smaller seat count closes seats from the back of the ready list and unseats whoever sat in them. */
  async updateSettings(
    account: AuthenticatedAccount,
    settings: GameSettings,
  ): Promise<LobbySnapshot> {
    const readyPlayers = await this.lobby.getReadyPlayers()
    if (readyPlayers[0]?.accountId !== account.accountId) {
      throw new OnlyHostCanChangeSettingsError()
    }

    await this.lobby.updateSettings(settings)
    await this.lobby.removeReadyPlayers(
      readyPlayers.slice(settings.playerCount).map((player) => player.accountId),
    )

    const snapshot = await this.getSnapshot(account)
    await this.publishLobbyUpdated()
    return snapshot
  }

  async getStartPlayers(hostAccountId: string): Promise<LobbyPlayer[]> {
    const readyPlayers = await this.lobby.getReadyPlayers()

    // Host authority comes from the first position in the ordered ready list.
    if (readyPlayers[0]?.accountId !== hostAccountId) {
      throw new OnlyHostCanStartError()
    }
    const { playerCount } = await this.lobby.getSettings()
    if (
      readyPlayers.length < MIN_PLAYER_COUNT ||
      readyPlayers.length > playerCount
    ) {
      throw new InvalidReadyPlayerCountError(MIN_PLAYER_COUNT, playerCount)
    }

    // Game creation will consume this group only after the game server accepts it.
    return readyPlayers
  }

  async startGame(hostAccountId: string): Promise<StartGameResponse> {
    // Prevent two host requests from creating the same ready group twice.
    if (this.gameStartInProgress) throw new GameStartInProgressError()
    this.gameStartInProgress = true

    try {
      const players = await this.getStartPlayers(hostAccountId)
      const accountIds = players.map((player) => player.accountId)

      // Refuse a stale ready group if any selected account is already in-game.
      const existingAssignments = await Promise.all(
        accountIds.map((accountId) =>
          this.assignments.findByAccountId(accountId),
        ),
      )
      if (existingAssignments.some(Boolean)) {
        throw new AccountAlreadyInGameError()
      }

      // The table as the host set it while this group was forming.
      const settings = await this.lobby.getSettings()
      let game: { gameId: string; webSocketUrl: string }
      try {
        // Keep the ready list unchanged until the Game server accepts creation.
        game = await this.gameServer.createGame({
          // The engine names each seat after its username (SeatView.name).
          players: players.map(({ accountId, username }) => ({
            accountId,
            username,
          })),
          settings,
        })
      } catch {
        throw new GameServerUnavailableError()
      }

      const assignedAt = new Date()
      const newAssignments: GameAssignment[] = accountIds.map((accountId) => ({
        accountId,
        gameId: game.gameId,
        webSocketUrl: game.webSocketUrl,
        assignedAt,
      }))
      await this.assignments.assign(newAssignments)

      // Free the ready list only after every selected account is assigned.
      await this.lobby.removeReadyPlayers(accountIds)
      await this.publishLobbyUpdated()
      await this.eventStream.publishGameAssignments(newAssignments)
      return { gameId: game.gameId, status: 'STARTING' }
    } finally {
      this.gameStartInProgress = false
    }
  }

  async completeGame(gameId: string): Promise<number> {
    // One completion event clears every player assigned to this game.
    const removed = await this.assignments.removeByGameId(gameId)

    // Repeated completion events are harmless and do not create duplicate SSE.
    if (removed > 0) await this.publishLobbyUpdated()
    return removed
  }

  private publishLobbyUpdated(): Promise<void> {
    // Build a caller-specific snapshot for each connected account.
    return this.eventStream.publishLobbyUpdated((account) =>
      this.getSnapshot(account),
    )
  }
}
