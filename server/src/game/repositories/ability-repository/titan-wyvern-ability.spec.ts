import { GameEventType, PassiveType, RollContext, TriggerScope } from 'shared'
import {
  effectInstalledBy,
  expectAbility,
  expiryEvents,
} from './ability-declaration-test-helpers'
import { TitanWyvernAbility } from './titan-wyvern-ability'

describe('TitanWyvernAbility', () => {
  it('registers its passive and discard fight-back', () => {
    expectAbility('monster-136', TitanWyvernAbility, [
      {
        on: GameEventType.MonsterSlain,
        scope: TriggerScope.SelfCard,
        steps: ['ApplyEffectTask'],
      },
      {
        on: GameEventType.MonsterFoughtBack,
        scope: TriggerScope.Attacker,
        steps: [
          'ChooseCardTask',
          'DiscardTask',
          'ChooseCardTask',
          'DiscardTask',
        ],
      },
    ])
  })

  it('installs a permanent +1 for Challenge rolls', () => {
    const effect = effectInstalledBy('monster-136')
    expect(effect).toEqual(
      expect.objectContaining({
        sourceCardId: 'monster-136',
        ownerId: 'p1',
        type: PassiveType.RollBonus,
        value: 1,
        rollContext: RollContext.Challenge,
      }),
    )
    expect(expiryEvents(effect)).toEqual([])
  })
})
