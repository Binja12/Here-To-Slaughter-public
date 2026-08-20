import { Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedAccount } from '../auth/auth.types'
import {
  AccountAlreadyInGameError,
  InvalidReadyPlayerCountError,
  LobbyFullError,
  OnlyHostCanStartError,
} from './lobby.errors'
import { GAME_ASSIGNMENT_STORE, LOBBY_STORE } from './lobby.interfaces'
import type { IGameAssignmentStore, ILobbyStore } from './lobby.interfaces'
import { LOBBY_CAPACITY, MIN_GAME_PLAYERS } from './lobby.types'
import type { LobbyPlayer, LobbySnapshot } from './lobby.types'

@Injectable()
export class LobbyService {
  constructor(
    @Inject(LOBBY_STORE)
    private readonly lobby: ILobbyStore,
    @Inject(GAME_ASSIGNMENT_STORE)
    private readonly assignments: IGameAssignmentStore,
  ) {}

  async getSnapshot(account: AuthenticatedAccount): Promise<LobbySnapshot> {
    const [readyPlayers, assignment] = await Promise.all([
      this.lobby.getReadyPlayers(),
      this.assignments.findByAccountId(account.accountId),
    ])
    const ready = readyPlayers.some(
      (player) => player.accountId === account.accountId,
    )

    // An active assignment takes priority over stale ready-list membership.
    const state = assignment ? 'IN_GAME' : ready ? 'READY' : 'IDLE'

    return {
      readyPlayers,
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
      if (readyPlayers.length >= LOBBY_CAPACITY) {
        throw new LobbyFullError(LOBBY_CAPACITY)
      }
      await this.lobby.addReadyPlayer({
        accountId: account.accountId,
        username: account.username,
      })
    }

    return this.getSnapshot(account)
  }

  async unready(account: AuthenticatedAccount): Promise<LobbySnapshot> {
    // Removing a missing player is idempotent.
    await this.lobby.removeReadyPlayer(account.accountId)
    return this.getSnapshot(account)
  }

  async getStartPlayers(hostAccountId: string): Promise<LobbyPlayer[]> {
    const readyPlayers = await this.lobby.getReadyPlayers()

    // Host authority comes from the first position in the ordered ready list.
    if (readyPlayers[0]?.accountId !== hostAccountId) {
      throw new OnlyHostCanStartError()
    }
    if (
      readyPlayers.length < MIN_GAME_PLAYERS ||
      readyPlayers.length > LOBBY_CAPACITY
    ) {
      throw new InvalidReadyPlayerCountError(MIN_GAME_PLAYERS, LOBBY_CAPACITY)
    }

    // Game creation will consume this group only after the game server accepts it.
    return readyPlayers
  }
}
