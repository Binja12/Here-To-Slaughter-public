import { GameEventType, PassiveType, TriggerScope } from 'shared'
import {
  effectInstalledBy,
  expectAbility,
  expiryEvents,
} from './ability-declaration-test-helpers'
import { CalmingVoiceAbility } from './calming-voice-ability'

describe('CalmingVoiceAbility', () => {
  it('registers its effect on its own successful roll', () => {
    expectAbility('hero-032', CalmingVoiceAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['ApplyEffectTask'],
      },
    ])
  })

  it("protects the owner's heroes until their next turn", () => {
    const effect = effectInstalledBy('hero-032')
    expect(effect).toEqual(
      expect.objectContaining({
        sourceCardId: 'hero-032',
        ownerId: 'p1',
        type: PassiveType.CantBeStolen,
      }),
    )
    expect(expiryEvents(effect)).toEqual([GameEventType.TurnStarted])
  })
})
