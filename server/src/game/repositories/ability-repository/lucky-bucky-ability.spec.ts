import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { LuckyBuckyAbility } from './lucky-bucky-ability'

describe('LuckyBuckyAbility', () => {
  it('registers pull, Hero check, confirmation, and play in order', () => {
    expectAbility('hero-042', LuckyBuckyAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['ChoosePlayerTask', 'PullCardTask', 'CardTypeCondition'],
      },
      {
        on: GameEventType.ConditionMet,
        scope: TriggerScope.SelfCard,
        when: 'LuckyBuckyPulledHero',
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'LuckyBuckyPlaysHero',
        steps: ['PlayHeroTask'],
      },
    ])
  })
})
