import { IGameEventEmitter } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext, CTX_DRAWN_CARD_IDS } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// Draw — the mechanic, extended by DrawCardAction (actions/) and by DrawTask
// below (§1).
// ---------------------------------------------------------------------------

/** Implements neither IAction nor ITask: see PlayMagic in magic-tasks.ts. */
export abstract class Draw {
  /**
   * Deck → hand, `count` times, each through `GameState.drawIntoHand` so
   * each is announced. Stops early when the deck gives nothing — which, since
   * the deck runs back from the discard, means both are empty. Returns what
   * was drawn, in order.
   */
  protected drawCards(
    gs: GameState,
    playerId: string,
    count: number,
    em: IGameEventEmitter,
  ): string[] {
    const drawn: string[] = []
    for (let i = 0; i < count; i++) {
      const cardId = gs.drawIntoHand(playerId, em)
      if (!cardId) break
      drawn.push(cardId)
    }
    return drawn
  }
}

/** Same mechanic as DrawCardAction, with no cost, N at a time, on the entry's owner. */
export class DrawTask extends Draw implements ITask {
  constructor(private readonly count: number) {
    super()
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    if (!gs.getPlayer(ctx.ownerId)) return

    // Set even when the deck ran dry: readers tell "drew nothing" from "never
    // drew" (see CardTypeCondition, RollOnHeroTask).
    ctx.set(CTX_DRAWN_CARD_IDS, this.drawCards(gs, ctx.ownerId, this.count, em))
  }
}
