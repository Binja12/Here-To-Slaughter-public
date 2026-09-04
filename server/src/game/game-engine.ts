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
    /** AND over the conditions rather than OR — `GameConfig.requireAllWinConditions`. */
    private readonly requireAll = false,
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
        // was holding. What that continuation OPENS does not hold the win
        // back — the roll a played hero is offered is a question, and the
        // sixth class has already landed — but a frame still waiting on an
        // OUTCOME does: a hero under an open challenge is not on the board
        // yet, and the board is asked again when that frame settles. A won
        // game does not resume the drain: nothing else may run on a
        // concluded board.
        if (this.gs.hasPendingOutcome() || !this.concludeIfWon()) {
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
    // The clock first: concluding closes whatever is still open, and a close
    // is what the clock would otherwise answer by running again. Then the
    // board, before the announcement, so whoever hears GameEnded sees a
    // concluded board that already names its winner.
    this.turnManager.stopClock()
    this.gs.conclude(winner.getId())
    this.emitter.emit(
      new GameEvent(GameEventType.GameEnded, winner.getId(), {
        winnerId: winner.getId(),
      }),
    )
    return true
  }

  /**
   * The first party that has met the table's conditions — every one of them
   * when the table requires all, any one of them otherwise. Asked per PLAYER
   * rather than per condition, because "all" means one party meeting them
   * together; two parties each holding half is nobody's win.
   *
   * A table with no conditions can never be won, so an empty list matches
   * nobody either way (`every` on an empty list would hand the win to whoever
   * sits first).
   */
  private checkWinConditions(): Player | null {
    if (this.winConditions.length === 0) return null
    return (
      this.gs.getPlayers().find((player) =>
        this.requireAll
          ? this.winConditions.every((wc) => wc.isMetBy(this.gs, player))
          : this.winConditions.some((wc) => wc.isMetBy(this.gs, player)),
      ) ?? null
    )
  }

  private startNextTurn(currentPlayerId: string): void {
    if (this.playerOrder.length === 0) return
    const idx = this.playerOrder.indexOf(currentPlayerId)
    const nextIdx = (idx + 1) % this.playerOrder.length
    this.turnManager.startTurn(this.playerOrder[nextIdx])
  }
}
