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
import { GameState, TURN_END_WINDOW_CAP_MS } from './game-state'
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
  /** Actions taken but not yet run: a non-reactable one that arrived mid-resolution. */
  private readonly actionQueue: IAction[] = []
  /**
   * The turn's clock. `remainingMs` is what the turn has left, `clock` runs
   * only while the player is free to act (`clockHeld`), and `runningSince`
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
  /**
   * Whether this turn's end has already capped the open windows. Once: a
   * reaction landing afterwards gives its window the full wait back, and
   * the next drain must not take it away again (§11).
   */
  private endCapped = false

  constructor(
    private gs: GameState,
    private emitter: GameEventEmitter,
    /** A turn's clock, ms. `TimeControl.turnTimeMs`; undefined = no clock. */
    private readonly turnTimeMs?: number,
  ) {
    // Only for the window and frame events, so the §8 listener order of
    // TaskManager and GameEngine is untouched.
    this.emitter.addListener(this)
  }

  onEvent(event: IGameEvent): void {
    switch (event.getType()) {
      // The clock is re-read off the board (`clockHeld`), never told —
      // except at an opening, which a window announces from its constructor,
      // BEFORE it is filed in its frame: held now, which is right for at
      // least the tick it takes, and re-read once it is filed. Not on
      // ReactionWindowClosed without seamless reactions: a roll or a
      // challenge announces its close before it settles its frame (§3), so
      // FrameResolved is the moment nothing is open. With them a settlement
      // releases first and announces after, and a contest starting or a
      // modifier landing moves the predicate too.
      case GameEventType.ReactionWindowOpened:
        this.pauseClock()
        if (this.gs.isSeamless()) setTimeout(() => this.syncClock(), 0).unref()
        break
      case GameEventType.FrameResolved:
        this.syncClock()
        break
      case GameEventType.ReactionWindowClosed:
      case GameEventType.ChallengeStarted:
      case GameEventType.ModifierApplied:
        if (this.gs.isSeamless()) this.syncClock()
        break
    }
  }

  /**
   * Whether the clock stands still. Without seamless reactions: under any
   * open window, anyone's. With them: exactly while the player is refused
   * actions — a reaction being resolved, a question of their own standing
   * (`GameState.refusesActions`) — one predicate for blocked and frozen.
   */
  private clockHeld(): boolean {
    if (!this.gs.isSeamless()) return this.gs.hasOpenFrames()
    const playerId = this.gs.getCurrentPlayerId()
    return playerId !== undefined && this.gs.refusesActions(playerId)
  }

  private syncClock(): void {
    if (this.clockHeld()) this.pauseClock()
    else this.resumeClock()
  }

  getPhase(): TurnPhase {
    return this.phase
  }

  /** ms left; undefined without a clock. */
  getRemainingMs(): number | undefined {
    if (this.remainingMs === undefined) return undefined
    if (this.clock === undefined) return this.remainingMs
    return Math.max(0, this.remainingMs - (Date.now() - this.runningSince!))
  }

  /** Epoch ms of the lapse; undefined while held or without a clock. Fixed while the clock runs, so snapshots of one turn agree. */
  getTurnDeadline(): number | undefined {
    if (this.clock === undefined || this.remainingMs === undefined) {
      return undefined
    }
    return this.runningSince! + this.remainingMs
  }

  /** `TimeControl.turnTimeMs`. */
  getTurnTimeMs(): number | undefined {
    return this.turnTimeMs
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
    // Without seamless reactions only a reactable action is refused on a
    // busy board — the rest queue for the idle drain. With them the refusal
    // is the board's own (`refusesActions`), and an optional question of the
    // player's is forfeited by the action rather than kept (§4).
    const refuses = this.gs.refusesActions(action.getPlayerId())
    if (refuses && (this.gs.isSeamless() || action.isReactable()))
      return refused(RefusalReason.Busy)
    const check = action.canExecute(this.gs)
    if (!check.accepted) return check
    if (this.gs.isSeamless()) {
      for (const question of this.gs.optionalQuestionsFor(action.getPlayerId())) {
        question.resolve()
      }
    }
    this.actionQueue.push(action)
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
    this.endCapped = false
    this.stopClock()
    this.remainingMs = this.turnTimeMs
    this.emitter.emit(
      new GameEvent(GameEventType.TurnStarted, playerId, { playerId }),
    )
    // AFTER the announcement: an ability answering TurnStarted may have
    // opened a window, and the clock does not run under one.
    this.syncClock()
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
   * ends the turn, the same way a pass does. Without seamless reactions the
   * clock only runs while no window is open, so it lapses on an idle board;
   * a pipeline can only be parked on a window, so a busy board here is an
   * engine mistake. With them it lapses under open windows, and the drain
   * caps their clocks and ends the turn on the close that leaves the board
   * idle.
   */
  private lapse(turn: number): void {
    this.clock = undefined
    if (turn !== this.turn || this.phase !== TurnPhase.Action) return
    if (this.gs.getGamePhase() === GamePhase.Concluded) return
    if (this.gs.isBusy() && !this.gs.isSeamless()) {
      throw new Error(
        'TurnManager: the turn clock lapsed on a busy board — it pauses while a window is open.',
      )
    }

    const playerId = this.gs.getCurrentPlayerId()
    if (playerId === undefined) return
    this.gs.decreaseActionPoints(playerId, this.gs.getActionPoints(playerId))
    this.drain()
  }

  getQueuedActions(): readonly IAction[] {
    return this.actionQueue
  }

  private drain(): void {
    const playerId = this.gs.getCurrentPlayerId()
    if (playerId === undefined) return

    while (this.actionQueue.length > 0) {
      if (this.gs.refusesActions(playerId)) return

      const action = this.actionQueue[0]

      if (!action.canExecute(this.gs).accepted) {
        this.actionQueue.shift()
        continue
      }

      this.actionQueue.shift()
      action.execute(this.gs)

      if (this.gs.refusesActions(playerId)) return
    }

    // Reached again on every FrameResolved via GameEngine.resumeDrain (and
    // every close, under seamless reactions), which is what ends a turn
    // whose last act was an ability. A spent turn that still has windows
    // open shortens their clocks: the next turn waits for them, not long.
    // Not while a question stands, anyone's: the play is still being
    // resolved, so its reactions keep their full clocks and are capped on
    // the close that settles the last question.
    const spent = this.gs.getActionPoints(playerId) <= 0
    if (!spent) {
      // Points back (a rollback): the end has not come yet after all.
      this.endCapped = false
      return
    }
    if (!this.gs.isBusy()) this.endTurn()
    else if (this.gs.isSeamless()) {
      if (this.gs.hasOpenQuestions()) {
        this.endCapped = false
        return
      }
      if (this.endCapped) return
      this.endCapped = true
      for (const window of this.gs.openWindows()) {
        window.capClock(TURN_END_WINDOW_CAP_MS)
      }
    }
  }
}
