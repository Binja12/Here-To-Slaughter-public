import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { PeanutAbility } from './peanut-ability'

describe('PeanutAbility', () => {
  it('registers draw two', () => {
    expectAbility('hero-048', PeanutAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['DrawTask'],
      },
    ])
  })
})
