import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { ButtonsAbility } from './buttons-ability'

describe('ButtonsAbility', () => {
  it('registers pull, Magic check, confirmation, and play in order', () => {
    expectAbility('hero-034', ButtonsAbility, [
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
        when: 'ButtonsPulledMagic',
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'ButtonsPlaysMagic',
        steps: ['PlayMagicTask'],
      },
    ])
  })
})
