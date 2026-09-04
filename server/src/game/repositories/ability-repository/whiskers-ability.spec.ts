import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { WhiskersAbility } from './whiskers-ability'

describe('WhiskersAbility', () => {
  it('registers steal before destroy', () => {
    expectAbility('hero-037', WhiskersAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: [
          'ChooseCardTask',
          'StealFromPartyTask',
          'ChooseCardTask',
          'DestroyTask',
        ],
      },
    ])
  })
})
