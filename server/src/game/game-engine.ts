import {
  GameEventType,
  GamePhase,
  IGameEvent,
  IGameEventListener,
} from 'shared'
import { IWinCondition } from './interfaces'
import { GameState } from './pipelines/game-state'
import { Player } from './state-structures/player'
import { TurnManager } from './pipelines/turn-manager'
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

  /**
   * `GameStarted` goes out BEFORE the first turn. A passive printed on a
   * leader has no card movement to hang off — a leader is never played and
   * never leaves — so this is what installs it, and it has to be standing
   * before anything can be rolled.
   *
   * TaskManager must already be listening, which the emitter ordering in §8
   * requires anyway.
   */
  start(playerOrder: string[]): void {
    this.playerOrder = playerOrder
    this.gs.setGamePhase(GamePhase.Turns)
    // No playerId: the event belongs to the table, and every leader matches it
    // through TriggerScope.Anyone, installing on its own owner.
    this.emitter.emit(
      new GameEvent(GameEventType.GameStarted, '', { playerOrder }),
    )
    if (playerOrder.length > 0) {
      this.turnManager.startTurn(playerOrder[0])
    }
  }

  onEvent(event: IGameEvent): void {
    switch (event.getType()) {
      case GameEventType.TurnEnded:
        if (!this.concludeIfWon()) {
          this.startNextTurn(event.getPlayerId())
        }
        break

      case GameEventType.FrameResolved:
        // TaskManager hears this first and continues the pipeline the frame
        // was holding; a board still busy after that is not settled yet and
        // is asked again on the next frame. A won game does not resume the
        // drain: nothing else may run on a concluded board.
        if (this.gs.isBusy() || !this.concludeIfWon()) {
          this.turnManager.resumeDrain()
        }
        break
    }
  }

  /**
   * The game ends the moment a settled board qualifies — the sixth class or
   * the third monster wins on the spot, not at the end of that turn. Asked
   * after every frame settles (a hero, an item and an attack each land inside
   * one) and at the end of a turn. Returns whether it ended.
   */
  private concludeIfWon(): boolean {
    if (this.gs.getGamePhase() === GamePhase.Concluded) return true
    const winner = this.checkWinConditions()
    if (!winner) return false
    // Before the announcement, so whoever hears GameEnded sees a concluded
    // board that already names its winner. A win lands mid-turn, so the
    // turn's clock is stopped here: nothing may run on a concluded board.
    this.gs.conclude(winner.getId())
    this.turnManager.stopClock()
    this.emitter.emit(
      new GameEvent(GameEventType.GameEnded, winner.getId(), {
        winnerId: winner.getId(),
      }),
    )
    return true
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
