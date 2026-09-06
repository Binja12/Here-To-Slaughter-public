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
 * Same mechanic as DrawCardAction, with no cost, on the entry's owner — or on
 * the chosen seat with `executor: 'chosen'` ("that player may DRAW a card",
 * Plundering Puma). Given a NUMBER it draws that many from the top, or "until
 * that many" when negative; given a SLOT NAME it draws the cards that slot
 * names out of wherever they lie in the deck — a card the player looked at
 * and chose (Bullseye: a choice over the deck's top three, then this).
 */
export class DrawTask extends Draw implements ITask {
  constructor(
    private readonly countOrKey: number | string,
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
    if (typeof this.countOrKey === 'number') {
      ctx.set(CTX_DRAWN_CARD_IDS, this.drawCards(gs, playerId, this.countOrKey, em))
      return
    }
    const named = ctx.get<string[]>(this.countOrKey) ?? []
    const drawn = named.filter((cardId) => gs.drawNamedIntoHand(playerId, cardId, em) !== null)
    ctx.set(CTX_DRAWN_CARD_IDS, drawn)
  }
}

/**
 * The card a slot names goes on top of the main deck, out of wherever it lies
 * in it — Bullseye's "return the other two to the top in any order": the
 * player picks which of the two is on top (a CardChoice over the deck's top
 * two, filed in CTX_DECK_TOP_CARD) and the other is second by itself. A slot
 * naming nothing, or a card no longer in the deck, moves nothing.
 */
export class ReturnToDeckTopTask implements ITask {
  constructor(private readonly key: string) {}

  execute(gs: GameState, ctx: AbilityContext): void {
    const [cardId] = ctx.get<string[]>(this.key) ?? []
    if (cardId) gs.moveToMainDeckTop(cardId)
  }
}
