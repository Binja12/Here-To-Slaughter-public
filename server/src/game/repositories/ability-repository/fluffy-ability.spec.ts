import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { FluffyAbility } from './fluffy-ability'

describe('FluffyAbility', () => {
  it('registers two complete choose-and-destroy pairs', () => {
    expectAbility('hero-038', FluffyAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: [
          'ChooseCardTask',
          'DestroyTask',
          'ChooseCardTask',
          'DestroyTask',
        ],
      },
    ])
  })
})
