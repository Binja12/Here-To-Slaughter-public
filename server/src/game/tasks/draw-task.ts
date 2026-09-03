import { IGameEventEmitter } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext, CTX_DRAWN_CARD_IDS } from '../abilities/ability-context'
import { Executor, executorOf } from './tasks'

// ---------------------------------------------------------------------------
// Draw — the mechanic, extended by DrawCardAction (actions/) and by DrawTask
// below (§1).
// ---------------------------------------------------------------------------

/** Implements neither IAction nor ITask: see PlayMagic in magic-tasks.ts. */
export abstract class Draw {
  /**
   * Deck → hand, each through `GameState.drawIntoHand` so each is announced.
   * A positive `count` draws that many; a NEGATIVE one draws "until you hold
   * that many" — `-7` is Wily Red's "DRAW cards until you have 7", `-5` is
   * the redraw — a hand already there draws nothing (nobody ever draws a
   * negative number, so the sign is free to mean this). Stops early when the
   * deck gives nothing — which, since the deck runs back from the discard,
   * means both are empty. Returns what was drawn, in order.
   */
  protected drawCards(
    gs: GameState,
    playerId: string,
    count: number,
    em: IGameEventEmitter,
  ): string[] {
    const drawn: string[] = []
    const wanted = () =>
      count >= 0 ? drawn.length < count : gs.getHandSize(playerId) < -count
    while (wanted()) {
      const cardId = gs.drawIntoHand(playerId, em)
      if (!cardId) break
      drawn.push(cardId)
    }
    return drawn
  }
}

/**
 * Same mechanic as DrawCardAction, with no cost, N at a time (or "until N",
 * negative), on the entry's owner — or on the chosen seat with
 * `executor: 'chosen'`: "that player may DRAW a card" (Plundering Puma).
 */
export class DrawTask extends Draw implements ITask {
  constructor(
    private readonly count: number,
    private readonly executor: Executor = 'owner',
  ) {
    super()
  }

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const playerId = executorOf(ctx, this.executor)
    if (!playerId || !gs.getPlayer(playerId)) return
    // Set even when the deck ran dry: readers tell "drew nothing" from "never
    // drew" (see CardTypeCondition, RollOnHeroTask).
    ctx.set(CTX_DRAWN_CARD_IDS, this.drawCards(gs, playerId, this.count, em))
  }
}
