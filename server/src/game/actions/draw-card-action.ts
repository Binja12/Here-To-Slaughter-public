import { ActionType, RefusalReason, RequestResult } from 'shared'
import { accepted, IAction, refused } from '../interfaces'
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

  canExecute(gs: GameState): RequestResult {
    if (gs.getActionPoints(this.playerId) < COST) {
      return refused(RefusalReason.NoActionPoints)
    }
    if (gs.getHandSize(this.playerId) >= MAX_HAND_SIZE) {
      return refused(RefusalReason.HandFull)
    }
    // Nothing to draw at all: the deck runs back from the discard, so an empty
    // deck means an empty discard too. A point is not spent on nothing.
    if (gs.getMainDeck().getSize() === 0)
      return refused(RefusalReason.DeckEmpty)
    return accepted()
  }

  execute(gs: GameState): void {
    gs.decreaseActionPoints(this.playerId, COST)
    this.drawCards(gs, this.playerId, 1, this.emitter)
  }
}
