import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { BadAxeAbility } from './bad-axe-ability'

describe('BadAxeAbility', () => {
  it('registers the destroy flow for Bad Axe', () => {
    expectAbility('hero-001', BadAxeAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['ChooseCardTask', 'DestroyTask'],
      },
    ])
  })
})
