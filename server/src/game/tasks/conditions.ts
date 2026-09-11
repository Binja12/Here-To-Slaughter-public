import { CardType, IGameEventEmitter } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AbilityContext, chosenPlayers, CTX_CHOSEN_PLAYER } from '../abilities/ability-context'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// CardTypeCondition — do the card(s) in a named slot have this type?
//
// Holds no steps. On a match it emits ConditionMet; whatever it guards is a
// separate registry entry triggered by that event. No match emits nothing.
//
// True when ANY card in the slot matches. An absent or empty slot is false.
//
// The slot it hands on holds the MATCHING cards, not everything it tested:
// "if either is an item, you may play it right away"
// offers the items, and the continuation is what the wording says it is
// (Quick Draw drew a Challenge first and the ask pointed at the Challenge).
// ---------------------------------------------------------------------------

export class CardTypeCondition implements ITask {
  constructor(
    private readonly cardType: CardType,
    /** Context slot naming the card(s) to test, e.g. CTX_DRAWN_CARD_IDS. */
    private readonly sourceKey: string,
    /** Announced on ConditionMet; a continuation matches it with `when`. */
    private readonly label: string,
  ) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: IReactionManager,
  ): void {
    const cardIds = ctx.get<string[]>(this.sourceKey) ?? []
    const held = cardIds.filter(
      (cardId) => gs.getCard(cardId)?.getType() === this.cardType,
    )
    if (held.length === 0) return

    // The tested slot rides along: the entry this unlocks runs with a fresh
    // context and cannot see this one. So does the chosen seat, when there is
    // one — "if it turns out to be a challenge card, take one more from the
    // same hand" needs the same player on the far side (Fury Knuckle, Bear
    // Claw).
    em.emit(
      GameEventFactory.conditionMet(ctx.ownerId, ctx.sourceCardId, this.label, {
        [this.sourceKey]: held,
        ...carriedSeat(ctx),
      }),
    )
  }
}

/**
 * The chosen seat as a context seed — what a continuation needs to keep
 * acting on "that player". Empty when no seat was chosen.
 */
export function carriedSeat(ctx: AbilityContext): Record<string, unknown> {
  const chosen = chosenPlayers(ctx)
  return chosen.length ? { [CTX_CHOSEN_PLAYER]: chosen } : {}
}
