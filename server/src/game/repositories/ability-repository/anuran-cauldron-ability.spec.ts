import { GameEventType, PassiveType, TriggerScope } from 'shared'
import {
  effectInstalledBy,
  expectAbility,
  expiryEvents,
} from './ability-declaration-test-helpers'
import { AnuranCauldronAbility } from './anuran-cauldron-ability'

describe('AnuranCauldronAbility', () => {
  it('registers its passive and sacrifice fight-back', () => {
    expectAbility('monster-124', AnuranCauldronAbility, [
      {
        on: GameEventType.MonsterSlain,
        scope: TriggerScope.SelfCard,
        steps: ['ApplyEffectTask'],
      },
      {
        on: GameEventType.MonsterFoughtBack,
        scope: TriggerScope.Attacker,
        steps: ['ChooseCardTask', 'SacrificeTask'],
      },
    ])
  })

  it('installs a permanent +1 for every roll context', () => {
    const effect = effectInstalledBy('monster-124')
    expect(effect).toEqual(
      expect.objectContaining({
        sourceCardId: 'monster-124',
        ownerId: 'p1',
        type: PassiveType.RollBonus,
        value: 1,
      }),
    )
    expect(effect.rollContext).toBeUndefined()
    expect(expiryEvents(effect)).toEqual([])
  })
})
