import { GameEventType, TurnPhase } from 'shared'
import { IAction } from './interfaces'
import { GameState } from './game-state'
import { GameEventEmitter } from './game-event-emitter'
import { GameEvent } from './game-event'

export class TurnManager {
  private actionQueue: IAction[] = []
  private actionPoints: number = 0
  private phase: TurnPhase = TurnPhase.TurnStart

  constructor(
    private gs: GameState,
    private emitter: GameEventEmitter,
  ) {}

  getPhase(): TurnPhase {
    return this.phase
  }

  getActionPoints(): number {
    return this.actionPoints
  }

  enqueue(action: IAction): void {
    if (this.phase !== TurnPhase.ActionWindow) return
    this.actionQueue.push(action)
    this.drain()
  }

  startTurn(playerId: string): void {
    const player = this.gs.getPlayer(playerId)
    if (!player) return
    this.gs.setCurrentPlayerId(playerId)
    this.gs.clearUsedAbilities()
    this.actionPoints = player.getActionPointsPerTurn()
    this.phase = TurnPhase.ActionWindow
    this.emitter.emit(
      new GameEvent(GameEventType.TurnStarted, playerId, { playerId }),
    )
  }

  endTurn(): void {
    this.phase = TurnPhase.TurnEnd
    const playerId = this.gs.getCurrentPlayerId() ?? ''
    this.emitter.emit(
      new GameEvent(GameEventType.TurnEnded, playerId, { playerId }),
    )
  }

  private drain(): void {
    while (this.actionQueue.length > 0) {
      const action = this.actionQueue[0]

      if (action.getCost() > this.actionPoints) {
        this.actionQueue.shift()
        continue
      }

      if (!action.canExecute(this.gs)) {
        this.actionQueue.shift()
        continue
      }

      this.actionQueue.shift()
      this.actionPoints -= action.getCost()
      const events = action.execute(this.gs)
      for (const event of events) {
        this.emitter.emit(event)
      }
    }

    if (this.actionPoints <= 0) {
      this.endTurn()
    }
  }
}
