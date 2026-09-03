import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { WildshotAbility } from './wildshot-ability'

describe('WildshotAbility', () => {
  it('registers draw three before discard', () => {
    expectAbility('hero-012', WildshotAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['DrawTask', 'ChooseCardTask', 'DiscardTask'],
      },
    ])
  })
})
