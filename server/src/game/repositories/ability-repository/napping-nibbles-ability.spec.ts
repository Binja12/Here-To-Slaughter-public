import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { NappingNibblesAbility } from './napping-nibbles-ability'

describe('NappingNibblesAbility', () => {
  it('registers an intentional zero-step ability', () => {
    expectAbility('hero-044', NappingNibblesAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: [],
      },
    ])
  })
})
