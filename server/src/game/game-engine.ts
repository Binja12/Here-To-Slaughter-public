import { GameEventType, IGameEvent, IGameEventListener } from 'shared'
import { IWinCondition } from './interfaces'
import { GameState } from './game-state'
import { Player } from './player'
import { TurnManager } from './turn-manager'
import { GameEventEmitter } from './events/game-event-emitter'
import { GameEvent } from './events/game-event'

export class GameEngine implements IGameEventListener {
  private playerOrder: string[] = []

  constructor(
    private gs: GameState,
    private turnManager: TurnManager,
    private emitter: GameEventEmitter,
    private winConditions: IWinCondition[] = [],
  ) {
    this.emitter.addListener(this)
  }

  start(playerOrder: string[]): void {
    this.playerOrder = playerOrder
    if (playerOrder.length > 0) {
      this.turnManager.startTurn(playerOrder[0])
    }
  }

  onEvent(event: IGameEvent): void {
    switch (event.getType()) {
      case GameEventType.TurnEnded:
        this.handleTurnEnded(event.getPlayerId())
        break

      // Both window-close events signal that the drain loop can resume.
      case GameEventType.ModifierWindowClosed:
      case GameEventType.ChallengeWindowClosed:
        this.turnManager.resumeDrain()
        break
    }
  }

  private handleTurnEnded(currentPlayerId: string): void {
    const winner = this.checkWinConditions()
    if (winner) {
      this.emitter.emit(
        new GameEvent(GameEventType.GameEnded, winner.getId(), {
          winnerId: winner.getId(),
        }),
      )
      return
    }
    this.startNextTurn(currentPlayerId)
  }

  private checkWinConditions(): Player | null {
    for (const wc of this.winConditions) {
      const winner = wc.check(this.gs)
      if (winner) return winner
    }
    return null
  }

  private startNextTurn(currentPlayerId: string): void {
    if (this.playerOrder.length === 0) return
    const idx = this.playerOrder.indexOf(currentPlayerId)
    const nextIdx = (idx + 1) % this.playerOrder.length
    this.turnManager.startTurn(this.playerOrder[nextIdx])
  }
}
