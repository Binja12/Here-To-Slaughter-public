import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { untilEndOfTurn } from '../../abilities/expiries'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'

// Iron Resolve (hero-030): cards you play cannot be challenged for the rest
// of your turn.
export const IronResolveAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.CantBeChallenged,
        expiry: untilEndOfTurn,
      }),
    ],
  },
]
