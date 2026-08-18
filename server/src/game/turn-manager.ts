import { GameEventType, TurnPhase } from 'shared'
import { IAction, IActionQueue } from './interfaces'
import { GameState } from './game-state'
import { GameEventEmitter } from './events/game-event-emitter'
import { GameEvent } from './events/game-event'

export class TurnManager implements IActionQueue {
  private phase: TurnPhase = TurnPhase.TurnStart

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
    if (action.isReactable() && this.hasOpenWindow()) return
    this.gs.actionQueue.push(action)
    this.drain()
  }

  /**
   * Front of the queue, for a continuation an action spawns mid-execute.
   * Does not drain: the caller is already inside the drain loop, which picks
   * this up on its next pass (or resumeDrain does, once a window settles).
   */
  enqueueFirst(action: IAction): void {
    this.gs.actionQueue.unshift(action)
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
    this.gs.clearChallengedCards()
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

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private hasOpenWindow(): boolean {
    return this.gs.hasOpenFrames()
  }

  private drain(): void {
    while (this.gs.actionQueue.length > 0) {
      if (this.hasOpenWindow()) return

      const action = this.gs.actionQueue[0]

      if (!action.canExecute(this.gs)) {
        this.gs.actionQueue.shift()
        continue
      }

      this.gs.actionQueue.shift()
      action.execute(this.gs)

      if (this.hasOpenWindow()) return
    }

    if (this.getActionPoints() <= 0 && !this.hasOpenWindow()) {
      this.endTurn()
    }
  }
}
