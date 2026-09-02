import { GameEventType, PassiveType, TurnPhase } from 'shared'
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
// The turn is not over while an ability is still resolving, so the drain asks
// `GameState.isBusy()` — the stack read off the board rather than off a
// TaskManager this would otherwise have to hold (§9).
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
    // Only the active player spends action points; everybody else answers with
    // REACTIONS, which go to ReactionManager and never touch this queue. Here
    // rather than in each action's canExecute, so an action cannot forget it.
    if (action.getPlayerId() !== this.gs.getCurrentPlayerId()) return
    if (action.isReactable() && this.gs.isBusy()) return
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

    // AFTER the reset, which sets the printed per-turn budget: a standing
    // ActionPointBonus is extra on top of it, every turn, for as long as the
    // effect stands. Read here rather than run as an ability because the
    // budget is settled before TurnStarted goes out — there is no pipeline
    // around to ask, which is what makes it an effect at all (§7).
    const extra = this.gs
      .getEffects(PassiveType.ActionPointBonus, playerId)
      .reduce((sum, effect) => sum + (effect.value ?? 0), 0)
    if (extra) player.increaseActionPoints(extra)

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

  private drain(): void {
    while (this.gs.actionQueue.length > 0) {
      if (this.gs.isBusy()) return

      const action = this.gs.actionQueue[0]

      if (!action.canExecute(this.gs)) {
        this.gs.actionQueue.shift()
        continue
      }

      this.gs.actionQueue.shift()
      action.execute(this.gs)

      if (this.gs.isBusy()) return
    }

    // Reached again on every FrameResolved via GameEngine.resumeDrain, which
    // is what ends a turn whose last act was an ability.
    if (this.getActionPoints() <= 0 && !this.gs.isBusy()) {
      this.endTurn()
    }
  }
}
