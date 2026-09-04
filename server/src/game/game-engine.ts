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
  /** Set by every event — nothing moves the board without one — and cleared by asking the win conditions. */
  private dirty = false

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
    this.dirty = true
    const concluded = this.concludeIfDue()
    switch (event.getType()) {
      case GameEventType.TurnEnded:
        if (!concluded) this.startNextTurn(event.getPlayerId())
        break

      case GameEventType.FrameResolved:
        // After TaskManager (§8), which continued the pipeline the frame held.
        if (!concluded) this.turnManager.resumeDrain()
        break

      case GameEventType.ReactionWindowClosed:
        // Under seamless reactions a settlement is a close, not a resolution
        // (§3): the frame was released before this went out, and this is the
        // drain that ends a spent turn. A cancelled window closed nothing.
        if (
          !concluded &&
          this.gs.isSeamless() &&
          (event.getPayload() as { cancelled?: boolean }).cancelled !== true
        ) {
          this.turnManager.resumeDrain()
        }
        break
    }
  }

  /**
   * Asks the win conditions once per change, and only while no frame may
   * still restore the board (GameState.hasPendingOutcome). Returns whether
   * the game is concluded, now or earlier.
   */
  private concludeIfDue(): boolean {
    if (this.gs.getGamePhase() === GamePhase.Concluded) return true
    if (!this.dirty || this.gs.hasPendingOutcome()) return false
    this.dirty = false
    const winner = this.checkWinConditions()
    if (!winner) return false
    // Clock before conclude: conclude closes windows, and a close is what
    // resumes the clock. Board before GameEnded, so its hearers see the winner.
    this.turnManager.stopClock()
    this.gs.conclude(winner.getId())
    this.emitter.emit(
      new GameEvent(GameEventType.GameEnded, winner.getId(), {
        winnerId: winner.getId(),
      }),
    )
    return true
  }

  /** Per player, not per condition: "all" means one party meeting every one. An empty list is never met. */
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
