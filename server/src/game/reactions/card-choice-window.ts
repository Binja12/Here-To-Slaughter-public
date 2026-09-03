import { ReactionWindowType } from 'shared'
import { ChoiceWindow } from './choice-window'
import { CTX_CHOSEN_CARD, NO_CONTEXT_RESULT } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// CardChoiceWindow — pick one card id from a pre-filtered list. The source
// (hand / party / discard) is decided by the filter before the window opens.
// ---------------------------------------------------------------------------

export class CardChoiceWindow extends ChoiceWindow {
  getType(): ReactionWindowType {
    return ReactionWindowType.CardChoice
  }

  override resultKey(): string | typeof NO_CONTEXT_RESULT {
    return CTX_CHOSEN_CARD
  }

  /**
   * A silent player still picks. The window already holds the filtered
   * candidates, so an idle one is drawn from exactly the list the player was
   * offered — a card that asks for a card cannot be dodged by waiting.
   *
   * No options is still no pick: that is "ran and produced nothing", and the
   * steps behind it skip on the empty slot.
   */
  protected override defaultChoice(): unknown {
    if (this.options.length === 0) return undefined
    return this.options[Math.floor(Math.random() * this.options.length)]
  }

  /** The card must still be registered when the window resolves. */
  protected override isStillValid(choice: unknown): boolean {
    return !!this.gs.getCard(choice as string)
  }
}
