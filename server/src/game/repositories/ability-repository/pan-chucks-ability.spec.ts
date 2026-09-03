import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { PanChucksAbility } from './pan-chucks-ability'

describe('PanChucksAbility', () => {
  it('registers draw, Challenge check, confirmation, and destroy in order', () => {
    expectAbility('hero-008', PanChucksAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['DrawTask', 'CardTypeCondition'],
      },
      {
        on: GameEventType.ConditionMet,
        scope: TriggerScope.SelfCard,
        when: 'PanChucksDrewChallenge',
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'PanChucksDestroysHero',
        steps: ['RevealTask', 'ChooseCardTask', 'DestroyTask'],
      },
    ])
  })
})
