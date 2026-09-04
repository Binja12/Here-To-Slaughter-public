import { GameEventType, Owner, PassiveType, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { SacrificeTask } from '../../tasks/hero-tasks'
import { ApplyEffectTask } from '../../tasks/tasks'

// Anuran Cauldron (monster-124)
//   Passive:    "Each time you roll, +1 to your roll."
//   Fight back: SACRIFICE a Hero card.
export const AnuranCauldronAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.MonsterSlain, scope: TriggerScope.SelfCard },
    steps: [new ApplyEffectTask({ type: PassiveType.RollBonus, value: 1 })],
  },
  {
    trigger: {
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Self }),
      new SacrificeTask(),
    ],
  },
]
