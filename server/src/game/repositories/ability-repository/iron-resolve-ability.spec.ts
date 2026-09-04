import { GameEventType, PassiveType, TriggerScope } from 'shared'
import {
  effectInstalledBy,
  expectAbility,
  expiryEvents,
} from './ability-declaration-test-helpers'
import { IronResolveAbility } from './iron-resolve-ability'

describe('IronResolveAbility', () => {
  it('registers its effect on its own successful roll', () => {
    expectAbility('hero-030', IronResolveAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['ApplyEffectTask'],
      },
    ])
  })

  it('protects every played card from challenges until turn end', () => {
    const effect = effectInstalledBy('hero-030')
    expect(effect).toEqual(
      expect.objectContaining({
        sourceCardId: 'hero-030',
        ownerId: 'p1',
        type: PassiveType.CantBeChallenged,
      }),
    )
    expect(effect.cardTypes).toBeUndefined()
    expect(expiryEvents(effect)).toEqual([GameEventType.TurnEnded])
  })
})
