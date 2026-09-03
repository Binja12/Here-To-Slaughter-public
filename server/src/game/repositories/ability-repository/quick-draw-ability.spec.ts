import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { QuickDrawAbility } from './quick-draw-ability'

describe('QuickDrawAbility', () => {
  it('registers the Snowball-shaped Item flow', () => {
    expectAbility('hero-010', QuickDrawAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['DrawTask', 'CardTypeCondition'],
      },
      {
        on: GameEventType.ConditionMet,
        scope: TriggerScope.SelfCard,
        when: 'QuickDrawDrewItem',
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'QuickDrawPlaysItem',
        steps: ['ChooseCardTask', 'PlayItemTask'],
      },
    ])
  })
})
