import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { untilOwnersNextTurn } from '../../abilities/expiries'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'

// Calming Voice (hero-032): your heroes cannot be stolen until your next turn.
export const CalmingVoiceAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.CantBeStolen,
        expiry: untilOwnersNextTurn,
      }),
    ],
  },
]
