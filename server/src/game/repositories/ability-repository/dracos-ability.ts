import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { SacrificeTask } from '../../tasks/hero-tasks'

// Dracos (monster-126)
//   Passive:    each time one of your heroes is destroyed, you may draw.
//   Fight back: SACRIFICE a Hero card.
const DRAW_A_CARD = 'DracosDrawsCard'

export const DracosAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.HeroDestroyed,
      scope: TriggerScope.OwnerEvent,
    },
    steps: [
      new ConfirmTask({ confirms: DRAW_A_CARD, question: 'Draw a card?' }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: DRAW_A_CARD,
    },
    steps: [new DrawTask(1)],
  },
  {
    trigger: {
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Self },
        { question: 'Choose a hero to sacrifice' },
      ),
      new SacrificeTask(),
    ],
  },
]
