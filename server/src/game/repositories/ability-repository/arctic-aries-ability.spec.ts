import { GameEventType, TriggerScope } from 'shared'
import { expectAbility } from './ability-declaration-test-helpers'
import { ArcticAriesAbility } from './arctic-aries-ability'

describe('ArcticAriesAbility', () => {
  it('registers the optional draw and sacrifice fight-back', () => {
    expectAbility('monster-128', ArcticAriesAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.OwnerEvent,
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'ArcticAriesDrawsCard',
        steps: ['DrawTask'],
      },
      {
        on: GameEventType.MonsterFoughtBack,
        scope: TriggerScope.Attacker,
        steps: ['ChooseCardTask', 'SacrificeTask'],
      },
    ])
  })
})
