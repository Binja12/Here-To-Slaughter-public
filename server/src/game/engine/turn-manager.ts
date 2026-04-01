import { TurnPhase, GamePhase, ReactionPhaseType } from 'shared'
import { GameState } from './game-state'
import { IAction, IChallengeable, IGameEvent } from './engine-interfaces'
import { ReactionPhase } from 'shared'

type TurnData = {
  activePlayerId: string
  phase: TurnPhase
  actionPoints: number
  usedHeroEffects: string[]
  actionQueue: IAction[]
  reactionPhase?: ReactionPhase
}

export class TurnManager {
  private turn?: TurnData
  private onEvents: (events: IGameEvent[]) => void

  constructor(
    private gs: GameState,
    onEvents: (events: IGameEvent[]) => void, // callback to broadcast events
  ) {
    this.onEvents = onEvents
  }

  // ── Turn lifecycle ──────────────────────────────

  startTurn(playerId: string): void {
    const actionPoints = this.gs.getConfig().actionPointsPerTurn
    // TODO: add bonus points from passive effects later

    this.turn = {
      activePlayerId: playerId,
      phase: TurnPhase.ActionPhase,
      actionPoints,
      usedHeroEffects: [],
      actionQueue: [],
      reactionPhase: undefined,
    }
  }

  endTurn(): void {
    if (!this.turn) return
    this.turn.phase = TurnPhase.TurnEnd
    // TODO: expire TurnEnd effects later
    // TODO: check win conditions later
    this.turn = undefined
  }

  // ── Action submission ───────────────────────────

  submitAction(action: IAction): void {
    if (!this.turn) throw new Error('No active turn')
    if (this.turn.phase !== TurnPhase.ActionPhase)
      throw new Error('Not in action Phase')
    if (this.turn.actionPoints < action.getCost())
      throw new Error('Not enough action points')
    if (action.getPlayerId() !== this.turn.activePlayerId)
      throw new Error('Not your turn')
    if (!action.canExecute(this.gs))
      throw new Error('Action cannot be executed')

    this.turn.actionPoints -= action.getCost()
    this.turn.actionQueue.push(action)
    this.processQueue()
  }

  // ── Queue processing ────────────────────────────

  private processQueue(): void {
    if (!this.turn) return
    if (this.turn.actionQueue.length === 0) {
      if (this.turn.actionPoints === 0) this.endTurn()
      return
    }

    // don't process if reaction Phase is open
    if (this.turn.reactionPhase && !this.turn.reactionPhase.resolved) return

    const action = this.turn.actionQueue[0]

    // open challenge Phase if needed
    if (this.isChallengeable(action) && !this.turn.reactionPhase) {
      this.openReactionPhase(action, ReactionPhaseType.Challenge)
      return
    }

    // execute action
    this.turn.actionQueue.shift()
    this.turn.reactionPhase = undefined
    const events = action.execute(this.gs)
    this.onEvents(events)

    // process next action if any
    this.processQueue()
  }

  // ── Reaction Phases ────────────────────────────

  private openReactionPhase(action: IAction, type: ReactionPhaseType): void {
    if (!this.turn) return
    this.turn.reactionPhase = {
      type,
      pendingActionId: action.getId(),
      timeoutMs: this.gs.getConfig().timeControl.reactionCountdownMs,
      openedAt: Date.now(),
      lastActivityAt: Date.now(),
      responses: [],
      resolved: false,
    }

    // start timer
    setTimeout(() => {
      this.closeReactionPhase()
    }, this.gs.getConfig().timeControl.reactionCountdownMs)
  }

  closeReactionPhase(): void {
    if (!this.turn?.reactionPhase) return
    this.turn.reactionPhase.resolved = true
    this.processQueue()
  }

  submitReaction(
    playerId: string,
    response: 'Challenge' | 'Modifier' | 'Pass',
    cardId?: string,
  ): void {
    if (!this.turn?.reactionPhase) return
    if (this.turn.reactionPhase.resolved) return

    this.turn.reactionPhase.responses.push({
      playerId,
      response,
      cardId,
      timestamp: Date.now(),
    })

    // reset timer on activity
    this.turn.reactionPhase.lastActivityAt = Date.now()

    // if all players passed → close Phase
    const playerCount = this.gs.getPlayers().length
    const passedCount = this.turn.reactionPhase.responses.filter(
      (r) => r.response === 'Pass',
    ).length

    if (passedCount >= playerCount - 1) {
      this.closeReactionPhase()
    }
  }

  // ── Hero effect tracking ────────────────────────

  markHeroEffectUsed(heroId: string): void {
    this.turn?.usedHeroEffects.push(heroId)
  }

  isHeroEffectUsed(heroId: string): boolean {
    return this.turn?.usedHeroEffects.includes(heroId) ?? false
  }

  // ── Getters ─────────────────────────────────────

  getActionPoints(): number {
    return this.turn?.actionPoints ?? 0
  }
  getActivePlayerId(): string | undefined {
    return this.turn?.activePlayerId
  }
  getPhase(): TurnPhase | undefined {
    return this.turn?.phase
  }
  getReactionPhase(): ReactionPhase | undefined {
    return this.turn?.reactionPhase
  }
  getCurrentTurn(): TurnData | undefined {
    return this.turn
  }

  // ── Helpers ─────────────────────────────────────

  private isChallengeable(action: IAction): boolean {
    return (
      'isChallengeable' in action &&
      (action as unknown as IChallengeable).isChallengeable()
    )
  }

  nextPlayer(): string {
    const players = this.gs.getPlayers()
    const currentIndex = players.findIndex(
      (p) => p.getId() === this.turn?.activePlayerId,
    )
    const nextIndex = (currentIndex + 1) % players.length
    return players[nextIndex].getId()
  }
}
