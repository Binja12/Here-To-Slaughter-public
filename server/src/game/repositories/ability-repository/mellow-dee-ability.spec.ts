import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { MellowDeeAbility } from './mellow-dee-ability'

describe('MellowDeeAbility', () => {
  it('registers draw, Hero check, confirmation, and play in order', () => {
    expectAbility('hero-041', MellowDeeAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['DrawTask', 'CardTypeCondition'],
      },
      {
        on: GameEventType.ConditionMet,
        scope: TriggerScope.SelfCard,
        when: 'MellowDeeDrewHero',
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'MellowDeePlaysHero',
        steps: ['PlayHeroTask'],
      },
    ])
  })
})
