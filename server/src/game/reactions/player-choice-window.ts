import { ReactionWindowType } from 'shared'
import { ChoiceWindow } from './choice-window'
import { CTX_CHOSEN_PLAYER, NO_CONTEXT_RESULT } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// PlayerChoiceWindow — pick one player id from a pre-filtered list.
// ---------------------------------------------------------------------------

export class PlayerChoiceWindow extends ChoiceWindow {
  getType(): ReactionWindowType {
    return ReactionWindowType.PlayerChoice
  }

  override resultKey(): string | typeof NO_CONTEXT_RESULT {
    return CTX_CHOSEN_PLAYER
  }

  /** The player must still be in the game when the window resolves. */
  protected override isStillValid(choice: unknown): boolean {
    return !!this.gs.getPlayer(choice as string)
  }
}
