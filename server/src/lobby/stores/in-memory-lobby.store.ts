import { Injectable } from '@nestjs/common'
import { ILobbyStore } from '../lobby.interfaces'
import { LobbyPlayer } from '../lobby.types'

export const DEFAULT_LOBBY_CAPACITY = 4

@Injectable()
export class InMemoryLobbyStore implements ILobbyStore {
  private readonly readyPlayers: LobbyPlayer[] = []
  private readonly capacity = DEFAULT_LOBBY_CAPACITY

  async getReadyPlayers(): Promise<LobbyPlayer[]> {
    // Preserve ready order while preventing callers from changing stored players.
    return this.readyPlayers.map(clonePlayer)
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
    if (this.readyPlayers.length >= this.capacity) {
      throw new Error(`Lobby is full (maximum ${this.capacity} players)`)
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
