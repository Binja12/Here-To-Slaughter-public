import { CardType, IGameEventEmitter } from 'shared'
import { IIfTask, IReactionManager, ITask } from '../interfaces'
import { GameState } from '../game-state'
import { AbilityContext, CTX_LAST_DRAWN_CARD_ID } from '../ability-context'

// ---------------------------------------------------------------------------
// CardTypeCondition — branches on the type of the last drawn card
//
// Reads CTX_LAST_DRAWN_CARD_ID from the ability context and compares the
// card's type to the expected type.  If no card was drawn yet the condition
// is treated as false.
// ---------------------------------------------------------------------------

export class CardTypeCondition implements IIfTask {
  condition: (gs: GameState, ctx: AbilityContext) => boolean
  ifTrue: ITask[]
  ifFalse?: ITask[]

  constructor(cardType: CardType, ifTrue: ITask[], ifFalse?: ITask[]) {
    this.condition = (_gs: GameState, ctx: AbilityContext): boolean => {
      const cardId = ctx.get<string>(CTX_LAST_DRAWN_CARD_ID)
      if (!cardId) return false
      return _gs.getCard(cardId)?.getType() === cardType
    }
    this.ifTrue = ifTrue
    this.ifFalse = ifFalse
  }

  execute(gs: GameState, ctx: AbilityContext, em: IGameEventEmitter, rm: IReactionManager): void {
    const branch = this.condition(gs, ctx) ? this.ifTrue : (this.ifFalse ?? [])
    for (const task of branch) {
      task.execute(gs, ctx, em, rm)
    }
  }
}
