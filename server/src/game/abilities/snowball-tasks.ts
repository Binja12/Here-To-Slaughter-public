import { CardType, GameEventType, IGameEventEmitter } from 'shared'
import { IAbility, IIfTask, ITask } from '../interfaces'
import { GameState } from '../game-state'
import { AbilityContext, CTX_LAST_DRAWN_CARD_ID } from '../ability-context'
import { DrawTask } from './tasks'

export { DrawTask }

export class CardTypeCondition implements IIfTask {
  condition: (gs: GameState, ctx: AbilityContext) => boolean
  ifTrue: ITask[]
  ifFalse?: ITask[]

  constructor(cardType: CardType, ifTrue: ITask[], ifFalse?: ITask[]) {
    this.condition = (_gs: GameState, ctx: AbilityContext): boolean => {
      const cardId = ctx.get<string>(CTX_LAST_DRAWN_CARD_ID)
      if (!cardId) return false
      const card = _gs.getCard(cardId)
      return card?.getType() === cardType
    }
    this.ifTrue = ifTrue
    this.ifFalse = ifFalse
  }

  execute(gs: GameState, ctx: AbilityContext, em: IGameEventEmitter): void {
    const branch = this.condition(gs, ctx) ? this.ifTrue : (this.ifFalse ?? [])
    for (const task of branch) {
      task.execute(gs, ctx, em)
    }
  }
}

export class InstaPlayTask implements ITask {
  constructor(private optional: boolean) {}

  execute(gs: GameState, ctx: AbilityContext, _em: IGameEventEmitter): void {
    const cardId = ctx.get<string>(CTX_LAST_DRAWN_CARD_ID)
    if (!cardId) return
    gs.setPendingInstaPlay({
      playerId: ctx.ownerId,
      cardId,
      optional: this.optional,
    })
  }
}

export const SnowballAbility: IAbility = {
  trigger: GameEventType.RollSuccess,
  steps: [
    new DrawTask(1),
    new CardTypeCondition(CardType.Magic, [
      new InstaPlayTask(true),
      new DrawTask(1),
    ]),
  ],
}
