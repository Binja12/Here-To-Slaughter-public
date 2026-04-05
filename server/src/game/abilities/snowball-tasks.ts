import { Audience, CardType, GameEventType, IGameEvent } from 'shared'
import { IAbility, IIfTask, ITask } from '../interfaces'
import { GameState } from '../game-state'
import { AbilityContext, CTX_LAST_DRAWN_CARD_ID } from '../ability-context'
import { GameEvent } from '../game-event'

export class DrawTask implements ITask {
  constructor(private count: number) {}

  execute(gs: GameState, ctx: AbilityContext): IGameEvent[] {
    const events: IGameEvent[] = []
    const player = gs.getPlayer(ctx.ownerId)
    if (!player) return events

    for (let i = 0; i < this.count; i++) {
      const cardId = gs.getMainDeck().draw()
      if (!cardId) break
      player.addToHand(cardId)
      ctx.set(CTX_LAST_DRAWN_CARD_ID, cardId)
      events.push(
        new GameEvent(
          GameEventType.CardDrawn,
          ctx.ownerId,
          { cardId },
          Audience.PlayerOnly,
        ),
      )
    }
    return events
  }
}

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

  execute(gs: GameState, ctx: AbilityContext): IGameEvent[] {
    const branch = this.condition(gs, ctx) ? this.ifTrue : (this.ifFalse ?? [])
    const events: IGameEvent[] = []
    for (const task of branch) {
      events.push(...task.execute(gs, ctx))
    }
    return events
  }
}

export class InstaPlayTask implements ITask {
  constructor(private optional: boolean) {}

  execute(gs: GameState, ctx: AbilityContext): IGameEvent[] {
    const cardId = ctx.get<string>(CTX_LAST_DRAWN_CARD_ID)
    if (!cardId) return []
    gs.setPendingInstaPlay({
      playerId: ctx.ownerId,
      cardId,
      optional: this.optional,
    })
    return []
  }
}

export const SnowballAbility: IAbility = {
  steps: [
    new DrawTask(1),
    new CardTypeCondition(CardType.Magic, [
      new InstaPlayTask(true),
      new DrawTask(1),
    ]),
  ],
}
