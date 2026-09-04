import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'

// Napping Nibbles (hero-044): "Do nothing."
// The empty entry is intentional: a successful roll has a real ability run,
// and that run performs exactly zero steps.
export const NappingNibblesAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [],
  },
]
