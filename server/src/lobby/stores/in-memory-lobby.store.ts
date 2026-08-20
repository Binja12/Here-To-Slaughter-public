import { Injectable } from '@nestjs/common'
import { LobbyFullError } from '../lobby.errors'
import { ILobbyStore } from '../lobby.interfaces'
import { LOBBY_CAPACITY, LobbyPlayer, LobbySettings } from '../lobby.types'

@Injectable()
export class InMemoryLobbyStore implements ILobbyStore {
  private readonly readyPlayers: LobbyPlayer[] = []
  private readonly settings: LobbySettings = { gameConfig: 'default' }

  async getReadyPlayers(): Promise<LobbyPlayer[]> {
    // Preserve ready order while preventing callers from changing stored players.
    return this.readyPlayers.map(clonePlayer)
  }

  async getSettings(): Promise<LobbySettings> {
    // Return a copy so future settings cannot be changed outside the store.
    return { ...this.settings }
  }

  async addReadyPlayer(player: LobbyPlayer): Promise<void> {
    // Becoming ready twice should not duplicate or reorder the player.
    if (
      this.readyPlayers.some(
        (candidate) => candidate.accountId === player.accountId,
      )
    ) {
      return
    }

    // Do not accept more players than one game can hold.
    if (this.readyPlayers.length >= LOBBY_CAPACITY) {
      throw new LobbyFullError(LOBBY_CAPACITY)
    }

    // Append the player; the first entry in the ordered list is the host.
    this.readyPlayers.push(clonePlayer(player))
  }

  async removeReadyPlayer(accountId: string): Promise<boolean> {
    // Find the player's position in the ordered ready list.
    const index = this.readyPlayers.findIndex(
      (player) => player.accountId === accountId,
    )
    if (index === -1) return false
    this.readyPlayers.splice(index, 1)
    return true
  }

  async removeReadyPlayers(accountIds: readonly string[]): Promise<number> {
    const selected = new Set(accountIds)
    let removed = 0

    // Remove a game group from the end so array indexes remain valid.
    for (let index = this.readyPlayers.length - 1; index >= 0; index -= 1) {
      if (selected.has(this.readyPlayers[index].accountId)) {
        this.readyPlayers.splice(index, 1)
        removed += 1
      }
    }
    return removed
  }
}

function clonePlayer(player: LobbyPlayer): LobbyPlayer {
  return { ...player }
}
