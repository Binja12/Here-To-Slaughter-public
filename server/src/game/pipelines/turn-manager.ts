import { GameEventType, TurnPhase } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from './game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEvent } from '../events/game-event'

// ---------------------------------------------------------------------------
// The Action queue, opposite TaskManager's pipeline stack (§1).
//
// Everything here arrives from the API as a player request. Work the engine
// starts for itself is a TASK, and goes to TaskManager — which is why there is
// no way to put an action at the front of this queue.
//
// The turn is not over while an ability is still resolving, so `busy()` reads
// TaskManager's stack off GameState rather than holding a TaskManager (§9).
// ---------------------------------------------------------------------------

export class TurnManager {
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
    if (action.isReactable() && this.busy()) return
    this.gs.actionQueue.push(action)
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

  /**
   * True while a reaction window is open or an ability still has steps to run.
   *
   * The stack, not the frames: a window releases its frame BEFORE it emits
   * `FrameResolved`, so between the two there is no open frame and the paused
   * pipeline has not woken yet.
   */
  private busy(): boolean {
    return this.gs.hasOpenFrames() || this.gs.abilityPipelines.length > 0
  }

  private drain(): void {
    while (this.gs.actionQueue.length > 0) {
      if (this.busy()) return

      const action = this.gs.actionQueue[0]

      if (!action.canExecute(this.gs)) {
        this.gs.actionQueue.shift()
        continue
      }

      this.gs.actionQueue.shift()
      action.execute(this.gs)

      if (this.busy()) return
    }

    // Reached again on every FrameResolved via GameEngine.resumeDrain, which
    // is what ends a turn whose last act was an ability.
    if (this.getActionPoints() <= 0 && !this.busy()) {
      this.endTurn()
    }
  }
}
