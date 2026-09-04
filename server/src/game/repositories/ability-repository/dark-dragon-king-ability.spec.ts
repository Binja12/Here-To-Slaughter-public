import { GameEventType, PassiveType, RollContext, TriggerScope } from 'shared'
import {
  effectInstalledBy,
  expectAbility,
  expiryEvents,
} from './ability-declaration-test-helpers'
import { DarkDragonKingAbility } from './dark-dragon-king-ability'

describe('DarkDragonKingAbility', () => {
  it('registers its passive and discard fight-back', () => {
    expectAbility('monster-133', DarkDragonKingAbility, [
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

  it('installs a permanent +1 for Hero-effect rolls', () => {
    const effect = effectInstalledBy('monster-133')
    expect(effect).toEqual(
      expect.objectContaining({
        sourceCardId: 'monster-133',
        ownerId: 'p1',
        type: PassiveType.RollBonus,
        value: 1,
        rollContext: RollContext.HeroEffect,
      }),
    )
    expect(expiryEvents(effect)).toEqual([])
  })
})
