import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { Draw } from '../tasks/draw-task'
import { GameEventEmitter } from '../events/game-event-emitter'

const MAX_HAND_SIZE = 10
const COST = 1

// ---------------------------------------------------------------------------
// The player-request half of drawing. The mechanic is Draw, in
// `tasks/draw-task.ts`, shared with DrawTask (§1); this adds the cost, the
// guards and a queue identity, and draws exactly one.
// ---------------------------------------------------------------------------

export class DrawCardAction extends Draw implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly emitter: GameEventEmitter,
  ) {
    super()
  }

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.DrawCard
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }

  isReactable(): boolean {
    return false
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (player.getActionPoints() < COST) return false
    if (player.getHandSize() >= MAX_HAND_SIZE) return false
    // Nothing to draw at all: the deck runs back from the discard, so an empty
    // deck means an empty discard too. A point is not spent on nothing.
    if (gs.getMainDeck().getSize() === 0) return false
    return true
  }

  execute(gs: GameState): void {
    gs.getPlayer(this.playerId)!.decreaseActionPoints(COST)
    this.drawCards(gs, this.playerId, 1, this.emitter)
  }
}
