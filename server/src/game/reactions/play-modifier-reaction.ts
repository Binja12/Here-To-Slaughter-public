import {
  IGameEventEmitter,
  ReactionType,
  RefusalReason,
  RequestResult,
} from 'shared'
import { IReaction, refused } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { GameEventFactory } from '../events/game-event-factory'
import { ModifierCard } from '../cards/modifier-card'

// ---------------------------------------------------------------------------
// The play, and only the play: spend the card and announce it. WHAT a modifier
// is worth is the card's own entry in the abilityRegistry, the same split
// every other card type has (§1).
//
// The value comes WITH the play, the way a target does, and is verified here
// against the `values` printed on the card before anything is spent — a
// number the card does not print is refused by name. It rides to the card's
// entry on the event, so the entry is one step and no window opens.
// ---------------------------------------------------------------------------

export class PlayModifierReaction implements IReaction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    /** Whose roll this is aimed at — a challenge has two. */
    private readonly targetPlayerId: string,
    /** One of the card's printed values. Verified in canExecute. */
    private readonly value: number,
  ) {}

  getId(): string {
    return this.id
  }
  getType(): ReactionType {
    return ReactionType.ApplyModifier
  }
  getPlayerId(): string {
    return this.playerId
  }

  canExecute(gs: GameState): RequestResult {
    if (!gs.hasInHand(this.playerId, this.cardId)) {
      return refused(RefusalReason.CardNotInHand)
    }
    const card = gs.getCard(this.cardId)
    if (!(card instanceof ModifierCard)) {
      return refused(RefusalReason.NotAModifier)
    }
    if (!card.getValues().includes(this.value)) {
      return refused(RefusalReason.ValueNotOnCard)
    }

    // One question, and it covers both halves: is a window open, and would it
    // take a bonus aimed at this player. execute() spends the card before the
    // entry can land anything, so a target the window would refuse has to be
    // caught while the card is still in hand.
    return gs.acceptsModifierFor(this.targetPlayerId)
  }

  execute(gs: GameState, em: IGameEventEmitter): void {
    // The same question canExecute asked. It has already said otherwise; this
    // is what keeps the announcement below honest if it is ever skipped.
    if (!gs.acceptsModifierFor(this.targetPlayerId).accepted) return
    const windowId = gs.modifierWindowIdFor(this.targetPlayerId)

    // Hand -> the owner's instance pile, where it is a card in play for as
    // long as the roll it was spent on is open. Keeping that roll alive is
    // part of spending, and happens in there.
    gs.spendCard(this.playerId, this.cardId)

    // The card's entry triggers on this; the target and the value ride on it.
    em.emit(
      GameEventFactory.modifierPlayed(
        this.playerId,
        this.cardId,
        this.targetPlayerId,
        this.value,
        windowId,
      ),
    )
  }
}
