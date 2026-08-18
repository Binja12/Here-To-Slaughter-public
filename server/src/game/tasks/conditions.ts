import { CardType, IGameEventEmitter } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../game-state'
import { AbilityContext } from '../ability-context'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// CardTypeCondition — do the card(s) in a named slot have this type?
//
// Holds no steps. On a match it emits ConditionMet; whatever it guards is a
// separate registry entry triggered by that event. No match emits nothing.
//
// True when ANY card in the slot matches. An absent or empty slot is false.
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
    const held = cardIds.some(
      (cardId) => gs.getCard(cardId)?.getType() === this.cardType,
    )
    if (!held) return

    // The tested slot rides along: the entry this unlocks runs with a fresh
    // context and cannot see this one.
    em.emit(
      GameEventFactory.conditionMet(ctx.ownerId, ctx.sourceCardId, this.label, {
        [this.sourceKey]: cardIds,
      }),
    )
  }
}
