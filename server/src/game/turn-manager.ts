import { GameEventType, TurnPhase } from 'shared'
import { IAction } from './interfaces'
import { GameState } from './game-state'
import { GameEventEmitter } from './game-event-emitter'
import { GameEvent } from './game-event'

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
    this.clearChallengedCards()
    player.resetActionPoints()
    this.phase = TurnPhase.ActionWindow
    this.emitter.emit(
      new GameEvent(GameEventType.TurnStarted, playerId, { playerId }),
    )
  }

  endTurn(): void {
    this.clearChallengedCards()
    this.phase = TurnPhase.TurnEnd
    const playerId = this.gs.getCurrentPlayerId() ?? ''
    this.emitter.emit(
      new GameEvent(GameEventType.TurnEnded, playerId, { playerId }),
    )
  }

  // --- Challenged-card tracking ---

  markCardChallenged(cardId: string): void {
    this.cardsChallengedThisTurn.push(cardId)
  }

  hasCardBeenChallenged(cardId: string): boolean {
    return this.cardsChallengedThisTurn.includes(cardId)
  }

  clearChallengedCards(): void {
    this.cardsChallengedThisTurn = []
  }

  // --- Internal ---

  private drain(): void {
    while (this.actionQueue.length > 0) {
      // Pause the loop while a reaction window is open.
      if (this.gs.hasOpenReactionWindow()) return

      const action = this.actionQueue[0]

      if (!action.canExecute(this.gs)) {
        this.actionQueue.shift()
        continue
      }

      this.actionQueue.shift()
      const events = action.execute(this.gs)
      for (const event of events) {
        this.emitter.emit(event)
      }

      // After each paid action, check whether AP is exhausted.
      // Don't end the turn if a reaction window is now open — resumeDrain handles that.
      if (this.getActionPoints() <= 0 && !this.gs.hasOpenReactionWindow()) {
        this.endTurn()
        return
      }
    }

    // Queue drained — end turn if AP is 0 and no window is blocking.
    if (this.getActionPoints() <= 0 && !this.gs.hasOpenReactionWindow()) {
      this.endTurn()
    }
  }
}
