import { CardType, GameEventType, TriggerScope } from 'shared'
import { IAbility } from '../interfaces'
import { DrawTask } from '../tasks/tasks'
import { CardTypeCondition } from '../tasks/conditions'

// Snowball: draw a card; if it's Magic, draw one more.
// ("Play it immediately" is a future pipeline step, not a special task.)
export const SnowballAbility: IAbility = {
  trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
  steps: [
    new DrawTask(1),
    new CardTypeCondition(CardType.Magic, [new DrawTask(1)]),
  ],
}
