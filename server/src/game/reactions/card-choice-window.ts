import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { ChoiceWindow } from './choice-window'
import { GameState } from '../pipelines/game-state'
import { CTX_CHOSEN_CARD, NO_CONTEXT_RESULT } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// CardChoiceWindow — pick one card id from a pre-filtered list. The source
// (hand / party / discard) is decided by the filter before the window opens.
// ---------------------------------------------------------------------------

export class CardChoiceWindow extends ChoiceWindow {
  constructor(
    id: string,
    respondentId: string,
    options: unknown[],
    timeoutMs: number,
    gs: GameState,
    frameId: string,
    emitter: IGameEventEmitter,
    /** The slot the pick is filed in — the task's choice (ChooseCardOptions.resultKey). */
    private readonly slot: string = CTX_CHOSEN_CARD,
    /** The card whose ability asks, for the screen (`detail.sourceCardId`). */
    sourceCardId?: string,
    /** What is asked, when the cards alone do not say (`detail.question`). */
    question?: string,
  ) {
    super(id, respondentId, options, timeoutMs, gs, frameId, emitter, {
      ...(sourceCardId && { sourceCardId }),
      ...(question && { question }),
    })
  }

  getType(): ReactionWindowType {
    return ReactionWindowType.CardChoice
  }

  override resultKey(): string | typeof NO_CONTEXT_RESULT {
    return this.slot
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

  protected override picksAtRandom(): boolean {
    return true
  }

  /** The card must still be registered when the window resolves. */
  protected override isStillValid(choice: unknown): boolean {
    return !!this.gs.getCard(choice as string)
  }
}
