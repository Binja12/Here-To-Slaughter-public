import { TurnPhase, GameEventType } from 'shared'
import {
  IAction,
  IGameEvent,
  IGameBroadcaster,
} from './interfaces/engine-interfaces'
import { GameState } from './states/game-state'
import { GameEvent } from './game-event'

type TurnData = {
  actionPoints: number
  phase: TurnPhase
  actionQueue: IAction[]
}

export class TurnManager {
  private turn: TurnData

  constructor(
    private gs: GameState,
    private bc: IGameBroadcaster,
    private onEvents: (events: IGameEvent[]) => void,
    private onTurnEnd: (currentPlayerId: string) => void,
  ) {
    this.turn = {
      actionPoints: gs.getConfig().getActionPoints(),
      phase: TurnPhase.TurnStart,
      actionQueue: [],
    }
  }

  // ── Turn lifecycle ──────────────────────────────────────────

  startTurn(playerId: string): void {
    this.gs.setCurrentPlayerId(playerId)
    this.gs.clearUsedHeroEffects()
    this.turn.actionPoints = this.gs.getConfig().getActionPoints()
    this.turn.actionQueue = []
    this.turn.phase = TurnPhase.ActionWindow
    const event = new GameEvent(GameEventType.TurnStarted, playerId)
    this.bc.send(event)
    this.onEvents([event])
  }

  endTurn(): void {
    this.turn.phase = TurnPhase.TurnEnd
    const currentPlayerId = this.gs.getCurrentPlayerId()!
    const event = new GameEvent(GameEventType.TurnEnded, currentPlayerId)
    this.bc.send(event)
    this.onEvents([event])
    this.onTurnEnd(currentPlayerId)
  }

  // ── Queue ───────────────────────────────────────────────────

  enqueue(action: IAction): void {
    if (this.turn.phase !== TurnPhase.ActionWindow) {
      throw new Error('Not in action window')
    }
    this.turn.actionQueue.push(action)
    this.drain()
  }

  drain(): void {
    while (this.turn.actionQueue.length > 0) {
      const action = this.turn.actionQueue[0]!
      if (!action.canExecute(this.gs)) {
        throw new Error(`Action ${action.getType()} cannot execute`)
      }
      this.turn.actionQueue.shift()
      const events = action.execute(this.gs)
      this.onEvents(events)
    }

    if (this.turn.actionPoints === 0) {
      this.endTurn()
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private nextPlayer(): string {
    const players = this.gs.getPlayers()
    const currentIndex = players.findIndex(
      (p) => p.getId() === this.gs.getCurrentPlayerId(),
    )
    const nextIndex = (currentIndex + 1) % players.length
    return players[nextIndex].getId()
  }

  // ── Getters ─────────────────────────────────────────────────

  getActionPoints(): number {
    return this.turn.actionPoints
  }

  getPhase(): TurnPhase {
    return this.turn.phase
  }
}
