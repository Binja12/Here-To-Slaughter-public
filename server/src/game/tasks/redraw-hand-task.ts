import { IGameEventEmitter } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext } from '../abilities/ability-context'
import { Draw } from './draw-task'

const REDRAW_COUNT = 5

// ---------------------------------------------------------------------------
// RedrawHand — the mechanic, extended by RedrawHandAction (actions/) and by
// RedrawHandTask below (§1).
// ---------------------------------------------------------------------------

/** Implements neither IAction nor ITask: see PlayMagic in magic-tasks.ts. */
export abstract class RedrawHand extends Draw {
  /**
   * DISCARD every card in hand, then DRAW until five are held — the draw
   * mechanic's negative count. One card at a time through the board's own
   * two doors, so each discard and each draw is announced. Every discard goes
   * out before the first draw — printed order — which is also why a deck that
   * empties half way through refills from a discard that already holds the
   * old hand.
   */
  protected redrawHand(
    gs: GameState,
    playerId: string,
    em: IGameEventEmitter,
  ): void {
    const player = gs.getPlayer(playerId)
    if (!player) return

    for (const cardId of player.getHand()) {
      gs.discardFromHand(playerId, cardId, em)
    }
    this.drawCards(gs, playerId, -REDRAW_COUNT, em)
  }
}

/** Same mechanic as RedrawHandAction, with no cost, on the entry's owner. */
export class RedrawHandTask extends RedrawHand implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    this.redrawHand(gs, ctx.ownerId, em)
  }
}
