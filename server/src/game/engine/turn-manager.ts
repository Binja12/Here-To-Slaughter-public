import { TurnPhase, ReactionWindowType, GameEventType, CardType } from 'shared'
import { GameState } from './game-state'
import { IAction, IGameEvent, IChallengeWindow } from './engine-interfaces'
import { GameEvent } from './game-event.ts'
import { ChallengeWindow } from './challenge-window'
import { ReactionManager } from './reaction-manager'

type TurnData = {
  activePlayerId: string
  actionPoints: number
  phase: TurnPhase
  usedHeroEffects: string[]
  actionQueue: IAction[]
  reactionWindow?: ChallengeWindow
}

type QueueSnapshot = {
  queue: IAction[]
}

export class TurnManager {
  private turn?: TurnData
  private reactionTimer?: NodeJS.Timeout
  private snapshotStack: QueueSnapshot[] = []

  constructor(
    private gs: GameState,
    private reactionManager: ReactionManager,
    private onEvents: (events: IGameEvent[]) => void,
    private flawPlay: boolean = false,
  ) {}

  // ── Turn lifecycle ──────────────────────────────────────────

  startTurn(playerId: string): void {
    const actionPoints = this.gs.getConfig().actionPointsPerTurn
    this.turn = {
      activePlayerId: playerId,
      actionPoints,
      phase: TurnPhase.ActionWindow,
      usedHeroEffects: [],
      actionQueue: [],
    }
    this.onEvents([new GameEvent(GameEventType.TurnStarted, playerId)])
  }

  endTurn(): void {
    if (!this.turn) return
    this.turn.phase = TurnPhase.TurnEnd
    this.onEvents([
      new GameEvent(GameEventType.TurnEnded, this.turn.activePlayerId),
    ])
    const nextPlayerId = this.nextPlayer()
    this.turn = undefined
    this.startTurn(nextPlayerId)
  }

  // ── Snapshot system ─────────────────────────────────────────

  private saveSnapshot(): void {
    this.snapshotStack.push({ queue: [...this.turn!.actionQueue] })
    this.gs.saveSnapshot()
  }

  private restoreSnapshot(): void {
    const snapshot = this.snapshotStack.pop()
    if (snapshot) this.turn!.actionQueue = snapshot.queue
    this.gs.restoreSnapshot()
  }

  private clearSnapshot(): void {
    this.snapshotStack.pop()
    this.gs.clearSnapshot()
  }

  // ── Action submission ───────────────────────────────────────

  submitAction(action: IAction): void {
    if (!this.turn) throw new Error('No active turn')
    if (this.turn.phase !== TurnPhase.ActionWindow)
      throw new Error('Not in action window')
    if (this.turn.actionPoints < action.getCost())
      throw new Error('Not enough action points')
    if (action.getPlayerId() !== this.turn.activePlayerId)
      throw new Error('Not your turn')
    if (!action.canExecute(this.gs))
      throw new Error('Action cannot be executed')

    if (this.turn.reactionWindow && !this.turn.reactionWindow.isResolved()) {
      if (action.isChallengeable()) {
        throw new Error(
          'Cannot play challengeable action while reaction window is open',
        )
      }
      if (!this.flawPlay) {
        throw new Error('Cannot act while reaction window is open')
      }
    }

    this.turn.actionPoints -= action.getCost()
    this.turn.actionQueue.push(action)
    this.processActions()
  }

  // ── Queue processing ────────────────────────────────────────

  private processActions(): void {
    if (!this.turn) return
    if (this.turn.actionQueue.length === 0) {
      if (this.turn.actionPoints === 0) this.endTurn()
      return
    }

    const action = this.turn.actionQueue[0]

    // step 1 — open challenge window if needed (defensive check)
    const challengedCardId = action.isChallengeable()

    if (challengedCardId && !this.reactionManager.getChallengeWindow()) {
      this.saveSnapshot()
      this.reactionManager.setChallengeWindow(
        new ChallengeWindow(
          this.turn.activePlayerId,
          challengedCardId,
          this.gs.getConfig().timeControl.reactionCountdownMs,
          () => this.processActions(), // onResolved callback
        ),
      )
      action.setChallengeable(false)

      if (this.flawPlay) {
        this.turn.actionQueue.shift()
        const events = action.execute(this.gs)
        this.onEvents(events)
        this.processActions()
      }
      return
    }

    // processActions step 2
    const challengeWindow = this.reactionManager.getChallengeWindow()
    if (challengeWindow?.isResolved()) {
      const challengerWon = challengeWindow.didChallengerWin()

      if (challengerWon) {
        this.restoreSnapshot()
        challengeWindow.resolve(this.gs)
        action.setChallengeable(true)
        this.reactionManager.clearChallengeWindow()
        return
      }

      this.clearSnapshot()
      challengeWindow.resolve(this.gs)
      action.setChallengeable(true)
      this.reactionManager.clearChallengeWindow()
      // fall through to step 3
    }

    // step 3 — execute action
    this.turn.actionQueue.shift()
    const events = action.execute(this.gs)
    this.onEvents(events)
    this.processActions()
  }

  // ── Hero effect tracking ────────────────────────────────────

  markHeroEffectUsed(heroId: string): void {
    this.turn?.usedHeroEffects.push(heroId)
  }

  isHeroEffectUsed(heroId: string): boolean {
    return this.turn?.usedHeroEffects.includes(heroId) ?? false
  }

  // ── Getters ─────────────────────────────────────────────────

  getActionPoints(): number {
    return this.turn?.actionPoints ?? 0
  }
  getActivePlayerId(): string | undefined {
    return this.turn?.activePlayerId
  }
  getPhase(): TurnPhase | undefined {
    return this.turn?.phase
  }
  getReactionWindow(): ChallengeWindow | undefined {
    return this.turn?.reactionWindow
  }
  isActiveTurn(): boolean {
    return this.turn !== undefined
  }

  // ── Helpers ─────────────────────────────────────────────────

  nextPlayer(): string {
    const players = this.gs.getPlayers()
    const currentIndex = players.findIndex(
      (p) => p.getId() === this.turn?.activePlayerId,
    )
    const nextIndex = (currentIndex + 1) % players.length
    return players[nextIndex].getId()
  }
}
