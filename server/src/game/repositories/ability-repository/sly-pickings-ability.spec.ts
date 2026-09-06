import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { SlyPickingsAbility } from './sly-pickings-ability'

describe('SlyPickingsAbility', () => {
  it('registers pull, Item check, confirmation, and equip in order', () => {
    expectAbility('hero-018', SlyPickingsAbility, [
      {
        on: GameEventType.RollPassing,
        scope: TriggerScope.SelfCard,
        steps: ['ChoosePlayerTask', 'TargetRollTask'],
      },
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['PullCardTask', 'CardTypeCondition'],
      },
      {
        on: GameEventType.ConditionMet,
        scope: TriggerScope.SelfCard,
        when: 'SlyPickingsPulledItem',
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'SlyPickingsPlaysItem',
        steps: ['ChooseCardTask', 'PlayItemTask'],
      },
    ])
  })
})
