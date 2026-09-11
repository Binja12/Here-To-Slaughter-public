import { GameEventType, PassiveType, TriggerScope } from 'shared'
import {
  effectInstalledBy,
  expectAbility,
  expiryEvents,
} from './ability-declaration-test-helpers'
import { VibrantGlowAbility } from './vibrant-glow-ability'

describe('VibrantGlowAbility', () => {
  it('registers its effect on its own successful roll', () => {
    expectAbility('hero-029', VibrantGlowAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['ApplyEffectTask'],
      },
    ])
  })

  it('installs +5 to every roll for the rest of the turn', () => {
    const effect = effectInstalledBy('hero-029')
    expect(effect).toEqual(
      expect.objectContaining({
        sourceCardId: 'hero-029',
        ownerId: 'p1',
        type: PassiveType.RollBonus,
        value: 5,
      }),
    )
    expect(effect.rollContext).toBeUndefined()
    expect(expiryEvents(effect)).toEqual([GameEventType.TurnEnded])
  })
})
