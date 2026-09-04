import {
  GameEventType,
  GamePhase,
  IGameEvent,
  IGameEventListener,
  PassiveType,
  RefusalReason,
  RequestResult,
  TurnPhase,
} from 'shared'
import { accepted, IAction, refused } from '../interfaces'
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

export class TurnManager implements IGameEventListener {
  private phase: TurnPhase = TurnPhase.Start
  /**
   * The turn's clock. `remainingMs` is what the turn has left, `clock` runs
   * only while no reaction window is open — anyone's — and `runningSince`
   * is when it last started, so a pause can take the elapsed part off.
   * All three undefined without `turnTimeMs`.
   */
  private remainingMs?: number
  private runningSince?: number
  private clock?: ReturnType<typeof setTimeout>
  /**
   * Counts turns started. A lapse carries the number of the turn it belongs
   * to, so one that outlives its turn does nothing.
   */
  private turn = 0

  constructor(
    private gs: GameState,
    private emitter: GameEventEmitter,
    /** A turn's clock, ms. `TimeControl.turnTimeMs`; undefined = no clock. */
    private readonly turnTimeMs?: number,
  ) {
    // Only for the window events: the clock pauses on the first one opened
    // and runs again once the last is closed. Nothing else is read here, so
    // the listener order §8 requires of TaskManager and GameEngine is
    // untouched.
    this.emitter.addListener(this)
  }

  onEvent(event: IGameEvent): void {
    switch (event.getType()) {
      case GameEventType.ReactionWindowOpened:
        this.pauseClock()
        break
      case GameEventType.ReactionWindowClosed:
        // A window is closed before it announces it; what is left open is
        // the others in its frame and any frame beneath.
        if (!this.gs.hasOpenFrames()) this.resumeClock()
        break
    }
  }

  getPhase(): TurnPhase {
    return this.phase
  }

  /** Current AP for the active player — delegates to Player. */
  getActionPoints(): number {
    const playerId = this.gs.getCurrentPlayerId()
    return playerId ? (this.gs.getPlayer(playerId)?.getActionPoints() ?? 0) : 0
  }

  /**
   * Says whether the request was TAKEN. With an idle board the action runs
   * inside this call; a non-reactable one arriving mid-resolution is queued
   * and runs on the drain that finds the board idle, so `drain` asks
   * `canExecute` again at that moment.
   */
  enqueue(action: IAction): RequestResult {
    // A concluded game refuses by name: a late request is a player's.
    if (this.gs.getGamePhase() === GamePhase.Concluded) {
      return refused(RefusalReason.GameOver)
    }
    // Outside the action phase is an engine mistake. Before the first turn
    // the transport routed input to a table it never started; between one
    // turn's End and the next Start the cascade is synchronous, so nothing
    // from outside can arrive.
    if (this.phase !== TurnPhase.Action) {
      throw new Error('TurnManager.enqueue outside the action phase')
    }
    // Only the active player spends action points; everybody else answers with
    // REACTIONS, which go to ReactionManager and never touch this queue. Here
    // rather than in each action's canExecute, so an action cannot forget it.
    if (action.getPlayerId() !== this.gs.getCurrentPlayerId()) {
      return refused(RefusalReason.NotYourTurn)
    }
    if (action.isReactable() && this.gs.isBusy())
      return refused(RefusalReason.Busy)
    const check = action.canExecute(this.gs)
    if (!check.accepted) return check
    this.gs.actionQueue.push(action)
    this.drain()
    return accepted()
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
    if (extra) this.gs.increaseActionPoints(playerId, extra)

    this.phase = TurnPhase.Action
    this.turn += 1
    this.stopClock()
    this.remainingMs = this.turnTimeMs
    this.emitter.emit(
      new GameEvent(GameEventType.TurnStarted, playerId, { playerId }),
    )
    // AFTER the announcement: an ability answering TurnStarted may have
    // opened a window, and the clock does not run under one.
    if (!this.gs.hasOpenFrames()) this.resumeClock()
  }

  /**
   * Forgets the turn's clock. Called at the end of a turn and when the
   * game concludes mid-turn, so no timer outlives the table.
   */
  stopClock(): void {
    this.pauseClock()
    this.remainingMs = undefined
  }

  private pauseClock(): void {
    if (this.clock === undefined) return
    clearTimeout(this.clock)
    this.clock = undefined
    this.remainingMs! -= Date.now() - this.runningSince!
  }

  private resumeClock(): void {
    if (this.remainingMs === undefined || this.clock !== undefined) return
    if (this.phase !== TurnPhase.Action) return
    const turn = this.turn
    this.runningSince = Date.now()
    this.clock = setTimeout(() => this.lapse(turn), this.remainingMs)
    // A clock on its own does not keep the process alive.
    this.clock.unref()
  }

  endTurn(): void {
    this.stopClock()
    this.gs.clearUsedAbilities()
    this.phase = TurnPhase.End
    const playerId = this.gs.getCurrentPlayerId() ?? ''
    this.emitter.emit(
      new GameEvent(GameEventType.TurnEnded, playerId, { playerId }),
    )
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * The turn's clock has run out: the budget is forfeited and the drain
   * ends the turn, the same way a pass does. The clock only runs while no
   * window is open, so it lapses on an idle board; a pipeline can only be
   * parked on a window, so a busy board here is an engine mistake.
   */
  private lapse(turn: number): void {
    this.clock = undefined
    if (turn !== this.turn || this.phase !== TurnPhase.Action) return
    if (this.gs.getGamePhase() === GamePhase.Concluded) return
    if (this.gs.isBusy()) {
      throw new Error(
        'TurnManager: the turn clock lapsed on a busy board — it pauses while a window is open.',
      )
    }

    const playerId = this.gs.getCurrentPlayerId()
    if (playerId === undefined) return
    this.gs.decreaseActionPoints(playerId, this.gs.getActionPoints(playerId))
    this.drain()
  }

  private drain(): void {
    while (this.gs.actionQueue.length > 0) {
      if (this.gs.isBusy()) return

      const action = this.gs.actionQueue[0]

      if (!action.canExecute(this.gs).accepted) {
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
