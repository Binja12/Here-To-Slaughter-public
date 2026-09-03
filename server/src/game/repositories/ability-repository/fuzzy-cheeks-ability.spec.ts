import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { FuzzyCheeksAbility } from './fuzzy-cheeks-ability'

describe('FuzzyCheeksAbility', () => {
  it('registers draw before choosing and playing a Hero', () => {
    expectAbility('hero-043', FuzzyCheeksAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['DrawTask', 'ChooseCardTask', 'PlayHeroTask'],
      },
    ])
  })
})
