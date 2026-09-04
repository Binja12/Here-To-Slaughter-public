import {
  GameEventType,
  Owner,
  PassiveType,
  RollContext,
  TriggerScope,
  Zone,
} from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { ApplyEffectTask, DiscardTask } from '../../tasks/tasks'

// Titan Wyvern (monster-136)
//   Passive:    +1 when you roll to challenge.
//   Fight back: DISCARD 2 cards.
export const TitanWyvernAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.MonsterSlain, scope: TriggerScope.SelfCard },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: 1,
        rollContext: RollContext.Challenge,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    },
    steps: [
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
    ],
  },
]
