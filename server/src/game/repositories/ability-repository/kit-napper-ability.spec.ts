import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { KitNapperAbility } from './kit-napper-ability'

describe('KitNapperAbility', () => {
  it('registers choose then steal', () => {
    expectAbility('hero-017', KitNapperAbility, [
      {
        on: GameEventType.RollPassing,
        scope: TriggerScope.SelfCard,
        steps: ['ChooseCardTask', 'TargetRollTask'],
      },
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['StealFromPartyTask'],
      },
    ])
  })
})
