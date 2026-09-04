import { Injectable } from '@nestjs/common'
import { DEFAULT_GAME_SETTINGS } from 'shared'
import type { GameSettings } from 'shared'
import { LobbyFullError } from '../lobby.errors'
import { ILobbyStore } from '../lobby.interfaces'
import { LobbyPlayer } from '../lobby.types'

@Injectable()
export class InMemoryLobbyStore implements ILobbyStore {
  private readonly readyPlayers: LobbyPlayer[] = []
  private settings: GameSettings = { ...DEFAULT_GAME_SETTINGS }

  async getReadyPlayers(): Promise<LobbyPlayer[]> {
    // Preserve ready order while preventing callers from changing stored players.
    return this.readyPlayers.map(clonePlayer)
  }

  async getSettings(): Promise<GameSettings> {
    // Return a copy so future settings cannot be changed outside the store.
    return { ...this.settings }
  }

  async updateSettings(settings: GameSettings): Promise<void> {
    this.settings = { ...settings }
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

    // Do not accept more players than the table is set to seat.
    if (this.readyPlayers.length >= this.settings.playerCount) {
      throw new LobbyFullError(this.settings.playerCount)
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
