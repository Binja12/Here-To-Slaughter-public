import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { SeriousGreyAbility } from './serious-grey-ability'

describe('SeriousGreyAbility', () => {
  it('registers destroy before draw', () => {
    expectAbility('hero-009', SeriousGreyAbility, [
      {
        on: GameEventType.RollPassing,
        scope: TriggerScope.SelfCard,
        steps: ['ChooseCardTask', 'TargetRollTask'],
      },
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['DestroyTask', 'DrawTask'],
      },
    ])
  })
})
