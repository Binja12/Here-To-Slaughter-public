import { CardType, IGameEventEmitter } from 'shared'
import { IReactionManager, ITask } from '../interfaces'
import { GameState } from '../game-state'
import { AbilityContext } from '../ability-context'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// CardTypeCondition — does the card(s) in a named slot have this type?
//
// It holds NO steps. When the test passes it emits ConditionMet with its label,
// and whatever the condition guards lives in its own registry entry triggered
// by that event — exactly how a confirm hands off to its continuation. When the
// test fails it emits nothing, so "false" is the absence of an event and there
// is nothing to skip past.
//
// This replaced an IIfTask that carried `ifTrue` / `ifFalse` lists and ran them
// INLINE, in its own loop, outside AbilityProcessor. That design predates
// frames and suspending steps entirely: a branch step that opened a window had
// no remainder tracked behind it, so the steps after it ran underneath that
// open window. It had been patched to pass a frameId out and to throw when a
// suspending step was not last — a restriction §8 recorded as "IIfTask can't
// contain suspending steps". Making the guarded steps a normal entry removes
// the restriction rather than policing it: they are ordinary pipeline steps
// now, with no position rules and no second way for a step to run.
//
// The slot is a constructor argument, so this task knows how to compare a
// card's type and nothing about where the card came from — the same rule as
// StealFromPartyTask(fromKey) and RollOnHeroTask(fromKey).
//
// Holds when ANY card in the slot has the type. With a single-card slot — every
// current use — that is just "is it this type"; with several it reads as "did
// this produce a Magic card". An absent or empty slot is false: nothing to ask
// about cannot be a match.
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

    // The tested slot rides along: the entry this unlocks starts with a fresh
    // context (§2 — nested runs do not inherit), and the cards it was asked
    // about are the obvious thing it will act on. Snowball's "you may play IT"
    // needs the drawn card two hops later — through this event, then the
    // confirm's.
    em.emit(
      GameEventFactory.conditionMet(ctx.ownerId, ctx.sourceCardId, this.label, {
        [this.sourceKey]: cardIds,
      }),
    )
  }
}
