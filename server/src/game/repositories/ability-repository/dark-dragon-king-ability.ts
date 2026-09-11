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

// Dark Dragon King (monster-133)
//   Passive:    +1 to rolls for Hero card effects.
//   Fight back: DISCARD 2 cards.
export const DarkDragonKingAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.MonsterSlain, scope: TriggerScope.SelfCard },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: 1,
        rollContext: RollContext.HeroEffect,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Self },
        { question: 'Choose the first card to discard' },
      ),
      new DiscardTask(),
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Self },
        { question: 'Choose the second card to discard' },
      ),
      new DiscardTask(),
    ],
  },
]
