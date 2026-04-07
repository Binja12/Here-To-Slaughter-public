import { GameEventType, TurnPhase } from 'shared'
import { IAction } from './interfaces'
import { GameState } from './game-state'
import { GameEventEmitter } from './events/game-event-emitter'
import { GameEvent } from './events/game-event'

export class TurnManager {
  private actionQueue: IAction[] = []
  private phase: TurnPhase = TurnPhase.TurnStart
  private cardsChallengedThisTurn: string[] = []

  constructor(
    private gs: GameState,
    private emitter: GameEventEmitter,
  ) {}

  getPhase(): TurnPhase {
    return this.phase
  }

  /** Current AP for the active player — delegates to Player. */
  getActionPoints(): number {
    const playerId = this.gs.getCurrentPlayerId()
    return playerId ? (this.gs.getPlayer(playerId)?.getActionPoints() ?? 0) : 0
  }

  enqueue(action: IAction): void {
    if (this.phase !== TurnPhase.ActionWindow) return
    this.actionQueue.push(action)
    this.drain()
  }

  /** Called by GameEngine after a reaction window closes to continue the drain loop. */
  resumeDrain(): void {
    this.drain()
  }

  startTurn(playerId: string): void {
    const player = this.gs.getPlayer(playerId)
    if (!player) return
    this.gs.setCurrentPlayerId(playerId)
    this.gs.clearUsedAbilities()
    player.resetActionPoints()
    this.phase = TurnPhase.ActionWindow
    this.emitter.emit(
      new GameEvent(GameEventType.TurnStarted, playerId, { playerId }),
    )
  }

  endTurn(): void {
    this.gs.clearUsedAbilities()
    this.phase = TurnPhase.TurnEnd
    const playerId = this.gs.getCurrentPlayerId() ?? ''
    this.emitter.emit(
      new GameEvent(GameEventType.TurnEnded, playerId, { playerId }),
    )
  }

  // --- Internal ---

  private drain(): void {
    while (this.actionQueue.length > 0) {
      const action = this.actionQueue[0]

      if (!action.canExecute(this.gs)) {
        this.actionQueue.shift()
        continue
      }

      this.actionQueue.shift()
      action.execute(this.gs)
    }

    // Queue drained — end turn if AP is 0 and no window is blocking.
    if (this.getActionPoints() <= 0) {
      this.endTurn()
    }
  }
}
