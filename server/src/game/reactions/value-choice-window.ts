import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { ValueBias } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { ChoiceWindow } from './choice-window'
import { CTX_CHOSEN_VALUE, NO_CONTEXT_RESULT } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// ValueChoiceWindow — pick one number from a printed list.
//
// A modifier card reads "+2 or -2 to that roll": the two numbers are card
// data, so the choice between them belongs in a window like any other pick,
// not in a value the client sends. This is what stops a submitted modifier
// being worth whatever the caller says it is.
// ---------------------------------------------------------------------------

export class ValueChoiceWindow extends ChoiceWindow {
  constructor(
    id: string,
    respondentId: string,
    options: unknown[],
    timeoutMs: number,
    gs: GameState,
    frameId: string,
    emitter: IGameEventEmitter,
    /**
     * Which way silence falls. Decided by the window being modified, because
     * only the roll knows whose it is — see IModifiableWindow.valueBiasFor.
     * A constructor argument rather than something read at resolve time: the
     * window it describes may have settled by then.
     */
    private readonly bias: ValueBias = 'highest',
  ) {
    // The bias rides in the opened payload too, so a client can show which way
    // a lapse will go before it goes that way.
    super(id, respondentId, options, timeoutMs, gs, frameId, emitter, { bias })
  }

  getType(): ReactionWindowType {
    return ReactionWindowType.ValueChoice
  }

  override resultKey(): string | typeof NO_CONTEXT_RESULT {
    return CTX_CHOSEN_VALUE
  }

  /**
   * A silent player still picks — the card is already spent, so the bonus has
   * to land somewhere. NOT at random, the way a card choice defaults: a number
   * has a direction, and the direction the player wanted is derivable from
   * what they aimed at.
   *
   * `highest` for a bonus put on your own roll, `lowest` for one put on
   * somebody else's, and in a challenge whichever way pushes against the card
   * being contested. A card printed with one value has one outcome either way.
   */
  protected override defaultChoice(): unknown {
    if (this.options.length === 0) return undefined
    const values = this.options as number[]
    return this.bias === 'highest' ? Math.max(...values) : Math.min(...values)
  }
}
