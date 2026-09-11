import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { untilEndOfTurn } from '../../abilities/expiries'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'

// Vibrant Glow (hero-029): "Add 5 to every roll you make for the rest of this turn."
export const VibrantGlowAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: 5,
        expiry: untilEndOfTurn,
      }),
    ],
  },
]
