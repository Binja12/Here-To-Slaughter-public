import { ReactionWindowType } from 'shared'
import { ChoiceWindow } from './choice-window'
import { CTX_CHOSEN_CARD, NO_CONTEXT_RESULT } from '../ability-context'

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

  /** The card must still be registered when the window resolves. */
  protected override isStillValid(choice: unknown): boolean {
    return !!this.gs.getCard(choice as string)
  }
}
